# Zoho Analytics Table Creation Guide

## Step 1: Access Your Workspace
1. Go to https://analytics.zoho.com/
2. Sign in with your Zoho account
3. Find workspace ID: `3062424000000007001`
4. Click on your workspace to enter it

## Step 2: Create TRANSACTIONS Table

### Method A: Import from CSV (Recommended)
1. Click **"New"** → **"New Table"** → **"Import Data"**
2. Choose **"CSV"** as data source
3. Download this sample CSV and upload it:

**Sample TRANSACTIONS CSV:**
```csv
id,account_id,date,amount,category,description,done,created_at,updated_at
550e8400-e29b-41d4-a716-446655440000,550e8400-e29b-41d4-a716-446655440001,2024-01-15,-50.00,Food,Grocery shopping,true,2024-01-15 10:00:00,2024-01-15 10:00:00
550e8400-e29b-41d4-a716-446655440002,550e8400-e29b-41d4-a716-446655440001,2024-01-20,2500.00,Salary,Monthly salary,true,2024-01-20 09:00:00,2024-01-20 09:00:00
550e8400-e29b-41d4-a716-446655440003,550e8400-e29b-41d4-a716-446655440001,2024-01-25,-120.00,Rent,Monthly rent,true,2024-01-25 08:00:00,2024-01-25 08:00:00
```

4. Name the table: **"TRANSACTIONS"**
5. Set column types:
   - id: Text
   - account_id: Text
   - date: Date
   - amount: Number
   - category: Text
   - description: Text
   - done: Boolean
   - created_at: Date & Time
   - updated_at: Date & Time

### Method B: Create Empty Table
1. Click **"New"** → **"New Table"** → **"Create"**
2. Name: **"TRANSACTIONS"**
3. Add columns manually with these exact names and types:

| Column Name | Type | Format |
|-------------|------|--------|
| id | Text | - |
| account_id | Text | - |
| date | Date | YYYY-MM-DD |
| amount | Number | Currency |
| category | Text | - |
| description | Text | - |
| done | Yes/No | - |
| created_at | Date & Time | YYYY-MM-DD HH:mm:ss |
| updated_at | Date & Time | YYYY-MM-DD HH:mm:ss |

## Step 3: Create ACCOUNTS Table

### Sample ACCOUNTS CSV:
```csv
id,client_id,name,balance,type,created_at,updated_at
550e8400-e29b-41d4-a716-446655440001,550e8400-e29b-41d4-a716-446655440004,Main Checking,2500.50,Checking,2024-01-01 00:00:00,2024-01-15 10:00:00
550e8400-e29b-41d4-a716-446655440005,550e8400-e29b-41d4-a716-446655440004,Savings Account,5000.00,Savings,2024-01-01 00:00:00,2024-01-20 09:00:00
```

**Column Setup:**
| Column Name | Type | Format |
|-------------|------|--------|
| id | Text | - |
| client_id | Text | - |
| name | Text | - |
| balance | Number | Currency |
| type | Text | - |
| created_at | Date & Time | YYYY-MM-DD HH:mm:ss |
| updated_at | Date & Time | YYYY-MM-DD HH:mm:ss |

## Step 4: Create GOALS Table

### Sample GOALS CSV:
```csv
id,account_id,goal_name,target_amount,current_amount,deadline,created_at,updated_at
550e8400-e29b-41d4-a716-446655440006,550e8400-e29b-41d4-a716-446655440005,Emergency Fund,10000.00,2500.00,2024-12-31,2024-01-01 00:00:00,2024-01-15 10:00:00
550e8400-e29b-41d4-a716-446655440007,550e8400-e29b-41d4-a716-446655440001,Vacation Fund,3000.00,800.00,2024-06-30,2024-01-01 00:00:00,2024-01-20 09:00:00
```

**Column Setup:**
| Column Name | Type | Format |
|-------------|------|--------|
| id | Text | - |
| account_id | Text | - |
| goal_name | Text | - |
| target_amount | Number | Currency |
| current_amount | Number | Currency |
| deadline | Date | YYYY-MM-DD |
| created_at | Date & Time | YYYY-MM-DD HH:mm:ss |
| updated_at | Date & Time | YYYY-MM-DD HH:mm:ss |

## Step 5: Get Table IDs

After creating each table:

1. Click on the table name in the left sidebar
2. Look at the URL in your browser
3. The Table ID is the long alphanumeric string after `/table/`
4. Example URL: `https://analytics.zoho.com/workspace/3062424000000007001/view/12345678901234567890`
5. Table ID = `12345678901234567890`

**Alternative method:**
1. Click the gear icon (⚙️) next to the table name
2. Go to "Table Settings"
3. The Table ID is displayed there

## Step 6: Update Configuration

Update `/config/zoho_table_config.json` with your Table IDs:

```json
{
  "TRANSACTIONS_TABLE_ID": "your_transactions_table_id_here",
  "ACCOUNTS_TABLE_ID": "your_accounts_table_id_here",
  "GOALS_TABLE_ID": "your_goals_table_id_here"
}
```

## Important Notes:

- **Use exact column names** (case-sensitive)
- **Use correct data types** as specified
- **Add sample data** to test the integration
- **Save Table IDs** immediately after creation
- **Test queries** in Zoho Analytics first before using in app

## Quick Test:

After setup, test your tables by running queries in Zoho Analytics:
- TRANSACTIONS: `SELECT * FROM TRANSACTIONS LIMIT 5`
- ACCOUNTS: `SELECT * FROM ACCOUNTS`
- GOALS: `SELECT * FROM GOALS`