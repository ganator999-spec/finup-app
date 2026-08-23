# FinUp - Zoho Analytics Integration Setup Guide

## 🔐 Step 1: Zoho OAuth Setup

### 1.1 Create OAuth Application

1. Visit https://accounts.zoho.com/developerconsole
2. Click **"Add Client"**
3. Select **"Server-based Applications"** and click **"Create"**
4. Fill in the following:
   - **Client Name:** FinUp Analytics
   - **Company Name:** (Your company)
   - **Homepage URL:** `http://localhost:3000`
   - **Authorized Redirect URIs:** `http://localhost:3000/auth/zoho/callback`
5. Click **"Create"**

### 1.2 Get Credentials

1. In the console, find your newly created app
2. Click on it to view details
3. Copy the **Client ID** and **Client Secret**

### 1.3 Update Environment Variables

Create or edit your `.env` file and add:

```env
ZOHO_CLIENT_ID=your_client_id_here
ZOHO_CLIENT_SECRET=your_client_secret_here
ZOHO_WORKSPACE_ID=3062424000000007001
ZOHO_REDIRECT_URI=http://localhost:3000/auth/zoho/callback
SESSION_SECRET=your_session_secret_here
# Optional. Defaults to the scopes required by the dashboard and organization lookup.
ZOHO_ANALYTICS_SCOPE=ZohoAnalytics.data.read,ZohoAnalytics.metadata.read
# Optional fallback for existing profiles without a stored organization ID.
# ZOHO_ANALYTICS_ORG_ID=your_analytics_org_id
# Optional local fallback for profiles without a mapped Zoho account ID.
# ZOHO_DEFAULT_ACCOUNT_ID=your_account_id
# Optional lookback period in days; useful for older local test data.
# ZOHO_ANALYTICS_DAYS=1000
```

> **Tip:** If your Zoho account uses a regional domain (for example EU or India), you may need to set these as well:
>
> ```env
> ZOHO_AUTH_DOMAIN=accounts.zoho.eu
> ZOHO_API_BASE_URL=https://analyticsapi.zoho.eu/api/v2
> ```
> 
> Replace `zoho.eu` with the domain that matches where you created the OAuth app (check the URL in your Zoho Developer Console: `accounts.zoho.*`).

The Analytics API uses scopes in the form `ZohoAnalytics.<scope>.<operation>`. For
the read-only dashboard queries in this project, use:

```env
ZOHO_ANALYTICS_SCOPE=ZohoAnalytics.data.read,ZohoAnalytics.metadata.read
```

The `metadata.read` scope is required to discover the organization ID used by
Analytics API requests. Do not use `ZohoAnalytics.workspace.READ` or
`ZohoAnalytics.table.READ`; those are not valid current Analytics API scopes.
After changing scopes, start the consent flow again so Zoho issues a refresh
token with the updated permissions.

## 📊 Step 2: Create Zoho Analytics Tables

Create these tables in your Zoho Analytics workspace. Update both the table IDs
and the exact table names in [zoho_table_config.json](./zoho_table_config.json).
The IDs identify the views for API configuration; SQL queries use the names.

### 2.1 TRANSACTIONS Table

Create table with these columns:

| Column Name | Type | Notes |
|------------|------|-------|
| id | UUID | Primary Key |
| account_id | UUID | Foreign Key to Accounts |
| date | Date | Transaction date |
| amount | Decimal | Transaction amount (positive for income, negative for expenses) |
| category | Text | Category (Food, Transportation, Housing, Entertainment, Utilities, etc.) |
| description | Text | Transaction description |
| done | Boolean | Payment status (true = paid, false = pending) |
| created_at | DateTime | Auto-fill current timestamp |
| updated_at | DateTime | Auto-fill current timestamp |

### 2.2 ACCOUNTS Table

Create table with these columns:

| Column Name | Type | Notes |
|------------|------|-------|
| id | UUID | Primary Key |
| client_id | UUID | Foreign Key to Client/User |
| name | Text | Account name (e.g., "Main Checking", "Savings") |
| balance | Decimal | Current account balance |
| type | Text | Account type (Checking, Savings, Credit Card, Investment) |
| created_at | DateTime | Auto-fill current timestamp |
| updated_at | DateTime | Auto-fill current timestamp |

### 2.3 GOALS Table

Create table with these columns:

| Column Name | Type | Notes |
|------------|------|-------|
| id | UUID | Primary Key |
| account_id | UUID | Foreign Key to Accounts |
| goal_name | Text | Goal name (e.g., "Emergency Fund", "Vacation") |
| target_amount | Decimal | Target amount to reach |
| current_amount | Decimal | Current progress toward goal |
| deadline | Date | Target completion date |
| created_at | DateTime | Auto-fill current timestamp |
| updated_at | DateTime | Auto-fill current timestamp |

## 🔧 Step 3: Update Table Configuration

After creating tables in Zoho, get their Table IDs and update `zoho_table_config.json`:

1. Log into your Zoho Analytics workspace
2. For each table, copy the Table ID from the URL or table settings
3. Update the configuration file with your table IDs

Example:
```json
{
  "TRANSACTIONS_TABLE_ID": "your_transactions_table_id",
  "ACCOUNTS_TABLE_ID": "your_accounts_table_id",
  "GOALS_TABLE_ID": "your_goals_table_id",
  "TRANSACTIONS_TABLE_NAME": "TRANSACTIONS",
  "ACCOUNTS_TABLE_NAME": "ACCOUNTS",
  "GOALS_TABLE_NAME": "GOALS"
}
```

## 🚀 Step 4: Connect User Account

1. User logs in to FinUp dashboard
2. Dashboard shows "Connect Zoho Analytics" button
3. Click button → redirects to Zoho login
4. Authorize FinUp app
5. Redirected back with access tokens automatically saved

## 📱 API Endpoints

Once connected, the following endpoints become available:

### Get Dashboard Analytics
- `GET /api/analytics/spending-by-category` - Spending breakdown by category
- `GET /api/analytics/income-expenses` - Income vs expenses over time
- `GET /api/analytics/transactions` - Recent transactions (last 90 days)
- `GET /api/analytics/goals` - User's financial goals progress
- `GET /api/analytics/savings-rate` - Calculate savings percentage

All endpoints require:
- User to be authenticated (`requireAuth` middleware)
- Zoho account to be connected (has valid access token)

## 🔄 Token Refresh

The system automatically refreshes expired Zoho tokens:
- Checks token expiration before each API call
- If expired, uses refresh token to get new access token
- New tokens are saved to user record

## 🐛 Troubleshooting

### Issue: "Zoho not connected"
- User needs to click "Connect Analytics" on dashboard
- Verify OAuth credentials in `.env` file

### Issue: "Failed to fetch analytics data"
- Check table IDs in `zoho_table_config.json`
- Verify Zoho API quotas haven't been exceeded
- Check that transactions exist in the specified date range

### Issue: OAuth redirect fails
- Verify `ZOHO_REDIRECT_URI` matches exactly in both code and Zoho Developer Console
- Clear browser cookies and try again

## 📚 Resources

- Zoho Analytics API: https://www.zoho.com/analytics/api/
- OAuth Documentation: https://www.zoho.com/accounts/protocol/oauth/
- Developer Console: https://accounts.zoho.com/developerconsole
