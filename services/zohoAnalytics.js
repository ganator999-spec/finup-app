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
    this.apiBaseUrl = process.env.ZOHO_API_BASE_URL || 'https://analyticsapi.zoho.com/api/v2';

    this.authUrl = `https://${this.authDomain}/oauth/v2/token`;
    this.authHost = `https://${this.authDomain}`;

    this.transactionsTableId = tableConfig.TRANSACTIONS_TABLE_ID;
    this.accountsTableId = tableConfig.ACCOUNTS_TABLE_ID;
    this.goalsTableId = tableConfig.GOALS_TABLE_ID;
  }

  // Get authorization URL for user login
  getAuthorizationUrl() {
    // Use comma-separated scopes because Zoho rejects the URL-encoded space form for this API.
    // Example: "ZohoAnalytics.workspace.READ,ZohoAnalytics.table.READ"
    const scopes = 'ZohoAnalytics.workspace.READ,ZohoAnalytics.table.READ';

    // Ensure the final scope string is safe for a URL. Commas are used as separators.
    const encodedScopes = scopes
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => encodeURIComponent(s))
      .join(',');

    const authUrl = `${this.authHost}/oauth/v2/auth?client_id=${this.clientId}&response_type=code&scope=${encodedScopes}&redirect_uri=${encodeURIComponent(this.redirectUri)}`;
    console.log('[Zoho] authUrl', authUrl);
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
          grant_type: 'authorization_code'
        }
      });

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in
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
        expiresIn: response.data.expires_in
      };
    } catch (error) {
      console.error('Error refreshing access token:', error.response?.data || error.message);
      throw new Error('Failed to refresh Zoho Analytics token');
    }
  }

  // Query Zoho Analytics table
  async queryTable(tableId, accessToken, query) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/workspaces/${this.workspaceId}/tables/${tableId}/data`,
        { sql: query },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error querying Zoho Analytics table:', error.response?.data || error.message);
      throw new Error('Failed to query analytics data');
    }
  }

  // Get transactions for a user (last 90 days)
  async getTransactions(accessToken, accountId) {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const dateStr = ninetyDaysAgo.toISOString().split('T')[0];

    const query = `
      SELECT id, date, amount, category, description, done, account_id, created_at
      FROM ${this.transactionsTableId}
      WHERE account_id = '${accountId}' AND date >= '${dateStr}'
      ORDER BY date DESC
    `;

    return await this.queryTable(this.transactionsTableId, accessToken, query);
  }

  // Get spending by category
  async getSpendingByCategory(accessToken, accountId) {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const dateStr = ninetyDaysAgo.toISOString().split('T')[0];

    const query = `
      SELECT category, SUM(amount) as total_spent
      FROM ${this.transactionsTableId}
      WHERE account_id = '${accountId}' AND date >= '${dateStr}' AND done = true
      GROUP BY category
      ORDER BY total_spent DESC
    `;

    return await this.queryTable(this.transactionsTableId, accessToken, query);
  }

  // Get income vs expenses
  async getIncomeVsExpenses(accessToken, accountId) {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const dateStr = ninetyDaysAgo.toISOString().split('T')[0];

    const query = `
      SELECT 
        DATE(date) as transaction_date,
        SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as expenses
      FROM ${this.transactionsTableId}
      WHERE account_id = '${accountId}' AND date >= '${dateStr}' AND done = true
      GROUP BY DATE(date)
      ORDER BY transaction_date DESC
    `;

    return await this.queryTable(this.transactionsTableId, accessToken, query);
  }

  // Get account information
  async getAccount(accessToken, accountId) {
    const query = `
      SELECT id, name, balance, type, created_at, updated_at
      FROM ${this.accountsTableId}
      WHERE id = '${accountId}'
      LIMIT 1
    `;

    return await this.queryTable(this.accountsTableId, accessToken, query);
  }

  // Get user's goals
  async getGoals(accessToken, accountId) {
    const query = `
      SELECT id, goal_name, target_amount, current_amount, deadline, account_id, created_at
      FROM ${this.goalsTableId}
      WHERE account_id = '${accountId}'
      ORDER BY deadline ASC
    `;

    return await this.queryTable(this.goalsTableId, accessToken, query);
  }

  // Get savings rate calculation
  async getSavingsRate(accessToken, accountId) {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const dateStr = ninetyDaysAgo.toISOString().split('T')[0];

    const query = `
      SELECT 
        SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as total_income,
        SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as total_expenses,
        ((SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) - SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END)) / SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END)) * 100 as savings_rate
      FROM ${this.transactionsTableId}
      WHERE account_id = '${accountId}' AND date >= '${dateStr}' AND done = true
    `;

    return await this.queryTable(this.transactionsTableId, accessToken, query);
  }
}

module.exports = new ZohoAnalyticsClient();
