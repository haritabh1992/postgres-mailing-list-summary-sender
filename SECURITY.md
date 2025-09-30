# Security Guide

## 🔒 **CRITICAL: Remove Hardcoded Secrets**

This project previously had hardcoded secrets in migration files. These have been removed and replaced with a secure configuration system.

## 🚨 **Immediate Action Required**

### **1. Update Database Secrets**

Run these commands in your Supabase SQL editor to set the actual secrets:

```sql
-- Set your actual Supabase URL
SELECT set_app_secret('supabase_url', 'https://your-actual-project-id.supabase.co', 'Supabase project URL');

-- Set your actual Supabase anon key
SELECT set_app_secret('supabase_anon_key', 'your-actual-anon-key-here', 'Supabase anonymous key');

-- Set your actual cron webhook secret
SELECT set_app_secret('cron_webhook_secret', 'your-actual-cron-secret-here', 'Cron webhook authentication secret');
```

### **2. Update Supabase Edge Function Secrets**

In your Supabase dashboard, go to Settings → Edge Functions and set:

```
CRON_WEBHOOK_SECRET=your-actual-cron-secret-here
```

## 🔍 **Verify Configuration**

Check that all secrets are properly configured:

```sql
-- Check configuration status
SELECT * FROM show_secure_config();
```

All `has_value` columns should be `true`.

## 🛡️ **Security Best Practices**

### **Never Commit These Files:**
- `.env.local`
- `.env.production`
- Any file containing actual API keys or secrets

### **Always Use:**
- Environment variables for secrets
- Placeholder values in example files
- Secure configuration tables for database secrets

### **Regular Security Checks:**
1. Scan codebase for hardcoded secrets: `grep -r "eyJ[A-Za-z0-9+/=]" .`
2. Check for exposed API keys: `grep -r "sk-" .`
3. Verify no secrets in git history: `git log --all --full-history -- "*.env*"`

## 🚨 **If Secrets Are Compromised**

1. **Immediately rotate all secrets** in Supabase dashboard
2. **Update database configuration** with new secrets
3. **Update environment variables** in all environments
4. **Review access logs** for unauthorized usage
5. **Consider regenerating** Supabase project keys if necessary

## 📋 **Security Checklist**

- [ ] All hardcoded secrets removed from code
- [ ] Environment variables configured
- [ ] Database secrets updated
- [ ] Supabase Edge Function secrets set
- [ ] `.env.local` added to `.gitignore`
- [ ] Configuration verified with `show_secure_config()`
- [ ] No secrets in git history
- [ ] Regular security scans scheduled

## 🔧 **Configuration Functions**

### **Get Secret Value:**
```sql
SELECT get_app_secret('supabase_url');
```

### **Update Secret:**
```sql
SELECT set_app_secret('cron_webhook_secret', 'new-secret-value', 'Updated cron secret');
```

### **Check Configuration:**
```sql
SELECT * FROM show_secure_config();
```

---

**Remember: Security is an ongoing process. Regularly audit your configuration and rotate secrets!**
