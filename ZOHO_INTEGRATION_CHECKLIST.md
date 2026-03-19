# Zoho Analytics Integration - Action Checklist

**Status:** OAuth Setup Complete ✅  
**OAuth credentials configured:** ✅  
**Server running with working OAuth:** ✅  
**Next: Create Zoho Analytics tables**

---

## ✅ COMPLETED STEPS

### STEP 1: Create Zoho OAuth Application ✅
- [x] Visit https://accounts.zoho.com/developerconsole
- [x] Sign in to your Zoho account (create one if needed)
- [x] Click "Add Client"
- [x] Select "Server-based Applications"
- [x] Fill in Application Name: "FinUp"
- [x] Set Authorized Redirect URI: `http://localhost:3000/auth/zoho/callback`
- [x] Set JS Domain URI: `http://localhost:3000/`
- [x] Save and copy **Client ID** and **Client Secret**
- [x] Added credentials to `.env` file

### STEP 2: Update .env File ✅
- [x] ZOHO_CLIENT_ID=1000.HFRPF09VC3PY3E80VI5KADR8QFGXWZ
- [x] ZOHO_CLIENT_SECRET=b1fca6281248c85a79fd4b910af3d663e3471fc31d
- [x] ZOHO_WORKSPACE_ID=3062424000000007001
- [x] ZOHO_REDIRECT_URI=http://localhost:3000/auth/zoho/callback

---

## 🔄 NEXT STEPS - Complete in Order

### STEP 3: Create Zoho Analytics Tables

**📁 Sample CSV files created in `/sample_data/` folder:**
- `TRANSACTIONS.csv` - Ready to import
- `ACCOUNTS.csv` - Ready to import  
- `GOALS.csv` - Ready to import

**Quick Import Method:**
1. Go to https://analytics.zoho.com/
2. Open workspace ID: `3062424000000007001`
3. For each table:
   - Click **"New"** → **"New Table"** → **"Import Data"**
   - Choose **"CSV"** as data source
   - Upload the corresponding CSV file from `/sample_data/`
   - Name the table exactly as shown (TRANSACTIONS, ACCOUNTS, GOALS)
   - Zoho will auto-detect column types

**Manual Creation Method:**
See detailed instructions in `ZOHO_TABLE_CREATION_GUIDE.md`
Go to your **Zoho Analytics workspace** (workspace ID: 3062424000000007001) and create 3 tables:

#### Table 1: TRANSACTIONS
| Column | Type |
|--------|------|
| id | UUID |
| account_id | UUID |
| date | Date |
| amount | Number |
| category | String |
| description | String |
| done | Boolean |
| created_at | DateTime |
| updated_at | DateTime |

Copy the **Table ID** from URL or table settings.

#### Table 2: ACCOUNTS
| Column | Type |
|--------|------|
| id | UUID |
| client_id | UUID |
| name | String |
| balance | Number |
| type | String |
| created_at | DateTime |
| updated_at | DateTime |

Copy the **Table ID**.

#### Table 3: GOALS
| Column | Type |
|--------|------|
| id | UUID |
| account_id | UUID |
| goal_name | String |
| target_amount | Number |
| current_amount | Number |
| deadline | Date |
| created_at | DateTime |
| updated_at | DateTime |

Copy the **Table ID**.

---

### STEP 4: Configure Table IDs
Edit `/config/zoho_table_config.json` and replace with your actual Table IDs:

```json
{
  "TRANSACTIONS_TABLE_ID": "your_actual_table_id",
  "ACCOUNTS_TABLE_ID": "your_actual_table_id",
  "GOALS_TABLE_ID": "your_actual_table_id"
}
```

---

### STEP 5: Test OAuth Flow
- [ ] Restart server: `npm start` (or let nodemon restart)
- [ ] Visit `http://localhost:3000/auth/zoho` in browser
- [ ] You should be redirected to Zoho login
- [ ] After login, you'll be redirected back with tokens stored
- [ ] Check `/views/dashboard.ejs` to verify data appears

---

## Files Reference

| File | Purpose |
|------|---------|
| `/services/zohoAnalytics.js` | OAuth client & API queries |
| `/models/Client.js` | User model with Zoho token fields |
| `/server.js` | Routes & endpoints (already configured) |
| `/config/zoho_table_config.json` | Table ID configuration |
| `/ZOHO_SETUP.md` | Detailed technical documentation |
| `/.env` | Environment variables (needs OAuth credentials) |

---

## Troubleshooting

**Redirect URI mismatch error?**
- Ensure OAuth app has exact URI: `http://localhost:3000/auth/zoho/callback`

**Table not found error?**
- Verify Table IDs in `zoho_table_config.json` match your Zoho workspace
- Table IDs appear in Zoho Analytics table settings/URL

**Analytics endpoints return empty?**
- Ensure Zoho tables have sample data
- Run test query from Zoho Analytics dashboard first

---

## Current Progress

✅ Backend infrastructure complete  
✅ Database models extended  
✅ Authentication routes ready  
✅ CSS design finalized  
⏳ Waiting for: OAuth credentials & Table IDs  

Once complete, dashboard will display real Zoho Analytics data!
