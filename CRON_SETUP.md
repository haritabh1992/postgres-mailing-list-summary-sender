# Cron Job Setup for PostgreSQL Mailing List Summary

This document explains how to set up automated scheduling for the `fetch-mail-threads` function to run every night at midnight.

## 🎯 Available Options

### Option 1: Database Cron (pg_cron) - **RECOMMENDED**
✅ **Already configured** in your Supabase database via migration `20240101000013_setup_cron_jobs.sql`

**Status**: The cron job is already set up and will run automatically every night at midnight UTC.

**What it does**:
- Creates a log entry in `processing_logs` table
- Updates `cron_schedule` table with execution times
- Triggers can be monitored via the database

**To check if it's working**:
```sql
-- View cron job status
SELECT * FROM cron.job WHERE jobname = 'fetch-mail-threads-nightly';

-- View execution logs
SELECT * FROM processing_logs WHERE process_type = 'cron_trigger' ORDER BY started_at DESC;

-- View schedule tracking
SELECT * FROM cron_schedule WHERE task_name = 'fetch-mail-threads-nightly';
```

### Option 2: External Cron Services via Webhook

If you prefer external cron services, use the `cron-webhook` Edge Function:

**Webhook URL**:
```
https://your-project-id.supabase.co/functions/v1/cron-webhook?task=fetch-mail-threads&secret=your-secret-key
```

#### 🔧 External Services Setup:

**1. cron-job.org (Free)**
- Go to https://cron-job.org
- Create account and add new cron job
- URL: `https://your-project-id.supabase.co/functions/v1/cron-webhook?task=fetch-mail-threads&secret=your-secret-key`
- Schedule: `0 0 * * *` (daily at midnight)
- Method: GET or POST

**2. EasyCron (Free tier available)**
- Go to https://www.easycron.com
- Create account and new cron job
- Same URL and schedule as above

**3. GitHub Actions (Free)**
```yaml
name: Daily Mail Thread Fetch
on:
  schedule:
    - cron: '0 0 * * *'  # Daily at midnight UTC
  workflow_dispatch:  # Manual trigger

jobs:
  fetch-mail-threads:
    runs-on: ubuntu-latest
    steps:
      - name: Call Cron Webhook
        run: |
          curl -X POST \
            "https://your-project-id.supabase.co/functions/v1/cron-webhook?task=fetch-mail-threads&secret=${{ secrets.CRON_SECRET }}" \
            -H "Content-Type: application/json"
```

**4. Vercel Cron Jobs**
Create `api/cron.js`:
```javascript
export default async function handler(req, res) {
  const response = await fetch(
    `https://your-project-id.supabase.co/functions/v1/cron-webhook?task=fetch-mail-threads&secret=${process.env.CRON_SECRET}`,
    { method: 'POST' }
  );
  
  const result = await response.json();
  res.json(result);
}

// Add to vercel.json:
{
  "crons": [{
    "path": "/api/cron",
    "schedule": "0 0 * * *"
  }]
}
```

## 🔑 Security Setup

**1. Set Cron Webhook Secret**
```bash
# In your Supabase project dashboard, go to Settings > Edge Functions
# Add environment variable:
CRON_WEBHOOK_SECRET=your-very-secure-secret-key-here
```

**2. Update Frontend Test (if needed)**
Update the secret in `DevTestPanel.tsx` to match your actual secret.

## 📋 Available Webhook Tasks

The `cron-webhook` function supports multiple tasks:

```bash
# Fetch mail threads only
?task=fetch-mail-threads

# Generate AI summary only  
?task=generate-summary

# Send summary emails only
?task=send-summary

# Run complete pipeline (fetch -> generate -> send)
?task=full-pipeline
```

## 🧪 Testing

**1. Test via Dev Panel**
- Go to your app in development mode
- Click "Test Cron Webhook" button
- Check the logs

**2. Test via Database Function**
```sql
SELECT test_cron_trigger();
```

**3. Test via Direct HTTP Call**
```bash
curl -X POST \
  "https://your-project-id.supabase.co/functions/v1/cron-webhook?task=fetch-mail-threads&secret=your-secret-key" \
  -H "Content-Type: application/json"
```

## 📊 Monitoring

**View Execution Logs**:
```sql
-- Recent full pipeline executions
SELECT * FROM processing_logs 
WHERE process_type = 'cron_full_pipeline' 
ORDER BY started_at DESC 
LIMIT 10;

-- Pipeline execution history with duration
SELECT * FROM get_pipeline_history(10);

-- Current webhook configuration
SELECT * FROM show_webhook_config();

-- All cron jobs
SELECT * FROM cron.job;

-- Cron schedule status
SELECT * FROM cron_schedule;
```

**Check Function Logs**:
- Go to Supabase Dashboard > Edge Functions
- Click on `cron-webhook` or `fetch-mail-threads`
- View the logs tab

## 🎯 Recommended Setup

**For Production**: Use the built-in `pg_cron` (Option 1) - it's already configured and running.

**For Backup/Redundancy**: Set up one external service (Option 2) as a backup.

**For Development**: Use the test button in the dev panel.

## 📝 Schedule Format

All schedules use standard cron format:
```
* * * * *
│ │ │ │ │
│ │ │ │ └─── Day of week (0-7, 0 or 7 = Sunday)
│ │ │ └───── Month (1-12)
│ │ └─────── Day of month (1-31)  
│ └───────── Hour (0-23)
└─────────── Minute (0-59)
```

**Examples**:
- `0 0 * * *` - Daily at midnight
- `0 6 * * 0` - Weekly on Sunday at 6 AM
- `30 2 * * *` - Daily at 2:30 AM
- `0 */6 * * *` - Every 6 hours

## ✅ Current Status

✅ **pg_cron extension enabled**
✅ **Database cron job created** (`fetch-mail-threads-nightly`)  
✅ **Webhook function deployed** (`cron-webhook`)
✅ **HTTP calls enabled** (pg_net extension)
✅ **Secret configured** (`CRON_WEBHOOK_SECRET`)
✅ **Test interface added** (Dev Panel)
✅ **Monitoring tables created** (`cron_schedule`, `processing_logs`)

**🎯 ACTIVE SETUP**: Your database cron job will automatically run the **COMPLETE PIPELINE** (fetch → content → generate → send) via webhook every night at midnight UTC! 🌙

**How it works**:
1. ⏰ **pg_cron** triggers `full-pipeline-nightly` at midnight UTC
2. 📞 **Database function** makes HTTP call to webhook with `task=full-pipeline`
3. 🔗 **Webhook** orchestrates the complete 4-step pipeline:
   - 📧 **Step 1**: `fetch-mail-threads` - Gets thread URLs from PostgreSQL archives
   - 📄 **Step 2**: `fetch-thread-content` - Fetches full email content (repeats until all done)
   - 🤖 **Step 3**: `generate-summary` - Creates AI summary from full content
   - 📤 **Step 4**: `send-summary` - Emails summary to subscribers
4. 📊 **Logs** track execution in `processing_logs` table
