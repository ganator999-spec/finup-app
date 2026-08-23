const axios = require('axios');
const tableConfig = require('../config/zoho_table_config.json');

class ZohoAnalyticsClient {
  constructor() {
    this.clientId = process.env.ZOHO_CLIENT_ID;
    this.clientSecret = process.env.ZOHO_CLIENT_SECRET;
    this.workspaceId = process.env.ZOHO_WORKSPACE_ID;
    this.redirectUri = process.env.ZOHO_REDIRECT_URI;

    // Allow using different Zoho regional endpoints (e.g. accounts.zoho.eu)
    this.authDomain = process.env.ZOHO_AUTH_DOMAIN || 'accounts.zoho.com';
    this.apiBaseUrl = process.env.ZOHO_API_BASE_URL || 'https://analyticsapi.zoho.com';

    this.authUrl = `https://${this.authDomain}/oauth/v2/token`;
    this.authHost = `https://${this.authDomain}`;

    this.transactionsTableId = tableConfig.TRANSACTIONS_TABLE_ID;
    this.accountsTableId = tableConfig.ACCOUNTS_TABLE_ID;
    this.goalsTableId = tableConfig.GOALS_TABLE_ID;
    this.transactionsTableName = tableConfig.TRANSACTIONS_TABLE_NAME || 'TRANSACTIONS';
    this.accountsTableName = tableConfig.ACCOUNTS_TABLE_NAME || 'ACCOUNTS';
    this.goalsTableName = tableConfig.GOALS_TABLE_NAME || 'GOALS';
    this.viewNameCache = new Map();
    this.exportQueue = Promise.resolve();
    this.queryCache = new Map();
    this.queryCacheTtlMs = 5 * 60 * 1000;
  }

  getRequestedScopes() {
    return process.env.ZOHO_ANALYTICS_SCOPE || 'ZohoAnalytics.data.read,ZohoAnalytics.metadata.read';
  }

  extractRows(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];
    if (Array.isArray(payload.rows)) return payload.rows;
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.data?.rows)) return payload.data.rows;
    if (Array.isArray(payload.data?.data)) return payload.data.data;
    if (Array.isArray(payload.response?.result)) return payload.response.result;
    return [];
  }

  numericValue(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  getDateRangeStart() {
    const lookbackDays = Number(process.env.ZOHO_ANALYTICS_DAYS || 90);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - lookbackDays);
    return startDate.toISOString().split('T')[0];
  }

  // Get authorization URL for user login
  getAuthorizationUrl() {
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      scope: this.getRequestedScopes(),
      redirect_uri: this.redirectUri,
      access_type: 'offline',
      prompt: 'consent'
    });
    const authUrl = `${this.authHost}/oauth/v2/auth?${params.toString()}`;
    return authUrl;
  }

  // Exchange authorization code for access token
  async getAccessToken(code) {
    try {
      const response = await axios.post(this.authUrl, null, {
        params: {
          code,
          client_id: this.clientId,
          client_secret: this.clientSecret,
          redirect_uri: this.redirectUri,
          grant_type: 'authorization_code',
          scope: this.getRequestedScopes()
        }
      });

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in,
        grantedScopes: response.data.scope || null
      };
    } catch (error) {
      console.error('Error getting access token:', error.response?.data || error.message);
      throw new Error('Failed to authenticate with Zoho Analytics');
    }
  }

  // Refresh access token using refresh token
  async refreshAccessToken(refreshToken) {
    try {
      const response = await axios.post(this.authUrl, null, {
        params: {
          refresh_token: refreshToken,
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'refresh_token'
        }
      });

      return {
        accessToken: response.data.access_token,
        expiresIn: response.data.expires_in,
        grantedScopes: response.data.scope || null
      };
    } catch (error) {
      console.error('Error refreshing access token:', error.response?.data || error.message);
      throw new Error('Failed to refresh Zoho Analytics token');
    }
  }

  async getOrganizationId(accessToken) {
    const response = await axios.get(`${this.apiBaseUrl}/restapi/v2/orgs`, {
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
    });
    const organizations = response.data?.data?.orgs || [];
    const organizationId = organizations.find((organization) => organization.isDefault)?.orgId
      || organizations[0]?.orgId;
    if (!organizationId) {
      throw new Error('No Zoho Analytics organization was found');
    }
    return organizationId;
  }

  async getViewName(viewId, accessToken, orgId) {
    if (this.viewNameCache.has(viewId)) {
      return this.viewNameCache.get(viewId);
    }

    const response = await axios.get(
      `${this.apiBaseUrl}/restapi/v2/workspaces/${this.workspaceId}/views`,
      {
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
          'ZANALYTICS-ORGID': orgId
        }
      }
    );
    const views = response.data?.data?.views || [];
    const view = views.find((candidate) => candidate.viewId === viewId);
    if (!view?.viewName) {
      throw new Error(`Zoho view ${viewId} was not found in workspace ${this.workspaceId}`);
    }

    this.viewNameCache.set(viewId, view.viewName);
    return view.viewName;
  }

  // Query Zoho Analytics table
  async queryTable(tableId, accessToken, query, orgId) {
    const cacheKey = JSON.stringify({
      tableId,
      query,
      accessToken,
      orgId: orgId || process.env.ZOHO_ANALYTICS_ORG_ID,
      workspaceId: this.workspaceId
    });
    const cached = this.queryCache.get(cacheKey);

    if (cached) {
      if (cached.data && cached.expiresAt > Date.now()) {
        console.log('[Zoho] Cache data used', {
          tableId,
          rowCount: this.extractRows(cached.data).length,
          cacheAgeSeconds: Math.round((Date.now() - cached.cachedAt) / 1000)
        });
        return cached.data;
      }
      if (cached.promise) return cached.promise;
      this.queryCache.delete(cacheKey);
    }

    const promise = this.enqueueExport(() => this.executeQuery(tableId, accessToken, query, orgId))
      .then((data) => {
        this.queryCache.set(cacheKey, {
          data,
          cachedAt: Date.now(),
          expiresAt: Date.now() + this.queryCacheTtlMs
        });
        return data;
      })
      .catch((error) => {
        const current = this.queryCache.get(cacheKey);
        if (current?.promise === promise) this.queryCache.delete(cacheKey);
        throw error;
      });

    this.queryCache.set(cacheKey, { promise });
    return promise;
  }

  enqueueExport(task) {
    const queuedTask = this.exportQueue.then(task, task);
    this.exportQueue = queuedTask.catch(() => undefined);
    return queuedTask;
  }

  async executeQuery(tableId, accessToken, query, orgId) {
    try {
      const resolvedOrgId = orgId
        || process.env.ZOHO_ANALYTICS_ORG_ID
        || await this.getOrganizationId(accessToken);
      const resolvedTableName = await this.getViewName(tableId, accessToken, resolvedOrgId);
      console.log('[Zoho] Table consulted', {
        tableId,
        tableName: resolvedTableName
      });

      const headers = {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        'ZANALYTICS-ORGID': resolvedOrgId
      };
      const config = encodeURIComponent(JSON.stringify({
        sqlQuery: query.replaceAll(`"${this.transactionsTableName}"`, `"${resolvedTableName}"`)
          .replaceAll(`"${this.accountsTableName}"`, `"${resolvedTableName}"`)
          .replaceAll(`"${this.goalsTableName}"`, `"${resolvedTableName}"`),
        responseFormat: 'json'
      }));
      const jobResponse = await axios.get(
        `${this.apiBaseUrl}/restapi/v2/bulk/workspaces/${this.workspaceId}/data?CONFIG=${config}`,
        { headers }
      );
      const jobId = jobResponse.data?.data?.jobId;
      if (!jobId) {
        throw new Error('Zoho did not return an export job ID');
      }

      for (let attempt = 0; attempt < 60; attempt += 1) {
        const statusResponse = await axios.get(
          `${this.apiBaseUrl}/restapi/v2/bulk/workspaces/${this.workspaceId}/exportjobs/${jobId}`,
          { headers }
        );
        const job = statusResponse.data?.data;
        if (job?.jobCode === '1004' || job?.jobCode === 1004) {
          const dataResponse = await axios.get(
            `${this.apiBaseUrl}/restapi/v2/bulk/workspaces/${this.workspaceId}/exportjobs/${jobId}/data`,
            { headers }
          );
          const result = dataResponse.data;
          console.log('[Zoho] Data retrieved', {
            tableName: resolvedTableName,
            rowCount: this.extractRows(result).length,
            data: this.extractRows(result)
          });
          return result;
        }
        if (job?.jobCode === '1003' || job?.jobCode === 1003 || job?.jobCode === '1005' || job?.jobCode === 1005) {
          const jobError = job.errorMessage
            || job.error
            || job.jobInfo?.errorMessage
            || job.jobInfo?.error
            || job.jobStatus
            || job.jobCode;
          console.error('[Zoho] Export job details:', JSON.stringify(job));
          throw new Error(`Zoho export job failed: ${jobError}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      throw new Error('Zoho export job timed out');
    } catch (error) {
      console.error('Error querying Zoho Analytics table:', error.response?.data || error.message);
      throw new Error('Failed to query analytics data');
    }
  }

  // Get transactions for a user (last 90 days)
  async getTransactions(accessToken, accountId, orgId) {
    const dateStr = this.getDateRangeStart();

    const resolvedAccountId = accountId || process.env.ZOHO_DEFAULT_ACCOUNT_ID;
    const accountFilter = resolvedAccountId ? `WHERE "account_id" = '${resolvedAccountId}' AND "date" >= '${dateStr}'` : `WHERE "date" >= '${dateStr}'`;
    const query = `
      SELECT "id", "date", "amount", "category", "description", "done", "account_id", "created_at"
      FROM "${this.transactionsTableName}"
      ${accountFilter}
      ORDER BY "date" DESC
    `;

    const result = await this.queryTable(this.transactionsTableId, accessToken, query, orgId);
    return {
      transactions: this.extractRows(result).map((row) => ({
        id: row.id,
        date: row.date,
        amount: this.numericValue(row.amount),
        category: row.category,
        description: row.description,
        done: row.done,
        accountId: row.account_id,
        createdAt: row.created_at
      }))
    };
  }

  // Get spending by category
  async getSpendingByCategory(accessToken, accountId, orgId) {
    const dateStr = this.getDateRangeStart();

    const resolvedAccountId = accountId || process.env.ZOHO_DEFAULT_ACCOUNT_ID;
    const accountFilter = resolvedAccountId ? `WHERE "account_id" = '${resolvedAccountId}' AND "date" >= '${dateStr}' AND "done" = 'true'` : `WHERE "date" >= '${dateStr}' AND "done" = 'true'`;
    const query = `
      SELECT "category", SUM("amount") as total_spent
      FROM "${this.transactionsTableName}"
      ${accountFilter}
      GROUP BY "category"
    `;

    const result = await this.queryTable(this.transactionsTableId, accessToken, query, orgId);
    const rows = this.extractRows(result).map((row) => ({
      category: row.category,
      amount: Math.abs(this.numericValue(row.total_spent || row.amount))
    }));
    const total = rows.reduce((sum, row) => sum + row.amount, 0);
    return {
      categories: rows.map((row) => ({
        ...row,
        percentage: total ? (row.amount / total) * 100 : 0
      }))
    };
  }

  // Get income vs expenses
  async getIncomeVsExpenses(accessToken, accountId, orgId) {
    const dateStr = this.getDateRangeStart();

    const resolvedAccountId = accountId || process.env.ZOHO_DEFAULT_ACCOUNT_ID;
    const accountFilter = resolvedAccountId ? `WHERE "account_id" = '${resolvedAccountId}' AND "date" >= '${dateStr}' AND "done" = 'true'` : `WHERE "date" >= '${dateStr}' AND "done" = 'true'`;
    const query = `
      SELECT
        SUM(if("amount" > 0, "amount", 0)) as income,
        SUM(if("amount" < 0, ABS("amount"), 0)) as expenses
      FROM "${this.transactionsTableName}"
      ${accountFilter}
    `;

    const result = await this.queryTable(this.transactionsTableId, accessToken, query, orgId);
    const row = this.extractRows(result)[0] || {};
    return {
      totalIncome: this.numericValue(row.income || row.total_income),
      totalExpenses: this.numericValue(row.expenses || row.total_expenses),
      balance: this.numericValue(row.balance)
    };
  }

  // Get account information
  async getAccount(accessToken, accountId) {
    const query = `
      SELECT "id", "name", "balance", "type", "created_at", "updated_at"
      FROM "${this.accountsTableName}"
      WHERE "id" = '${accountId}'
      LIMIT 1
    `;

    return await this.queryTable(this.accountsTableId, accessToken, query);
  }

  // Get user's goals
  async getGoals(accessToken, accountId, orgId) {
    const resolvedAccountId = accountId || process.env.ZOHO_DEFAULT_ACCOUNT_ID;
    const accountFilter = resolvedAccountId ? `WHERE "account_id" = '${resolvedAccountId}'` : '';
    const query = `
      SELECT "id", "goal_name", "target_amount", "current_amount", "deadline", "account_id", "created_at"
      FROM "${this.goalsTableName}"
      ${accountFilter}
      ORDER BY "deadline" ASC
    `;

    const result = await this.queryTable(this.goalsTableId, accessToken, query, orgId);
    return {
      goals: this.extractRows(result).map((row) => ({
        id: row.id,
        goalName: row.goal_name,
        targetAmount: this.numericValue(row.target_amount),
        currentAmount: this.numericValue(row.current_amount),
        deadline: row.deadline,
        accountId: row.account_id,
        createdAt: row.created_at
      }))
    };
  }

  // Get savings rate calculation
  async getSavingsRate(accessToken, accountId, orgId) {
    const dateStr = this.getDateRangeStart();

    const resolvedAccountId = accountId || process.env.ZOHO_DEFAULT_ACCOUNT_ID;
    const accountFilter = resolvedAccountId ? `WHERE "account_id" = '${resolvedAccountId}' AND "date" >= '${dateStr}' AND "done" = 'true'` : `WHERE "date" >= '${dateStr}' AND "done" = 'true'`;
    const query = `
      SELECT 
        SUM(if("amount" > 0, "amount", 0)) as total_income,
        SUM(if("amount" < 0, ABS("amount"), 0)) as total_expenses,
        ((SUM(if("amount" > 0, "amount", 0)) - SUM(if("amount" < 0, ABS("amount"), 0))) / SUM(if("amount" > 0, "amount", 0))) * 100 as savings_rate
      FROM "${this.transactionsTableName}"
      ${accountFilter}
    `;

    const result = await this.queryTable(this.transactionsTableId, accessToken, query, orgId);
    const row = this.extractRows(result)[0] || {};
    return { savingsRate: this.numericValue(row.savings_rate) };
  }
}

module.exports = new ZohoAnalyticsClient();
