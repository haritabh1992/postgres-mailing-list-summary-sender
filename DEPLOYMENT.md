# Deployment Guide

This guide covers deploying the PostgreSQL Mailing List Summary Sender to production.

## Prerequisites

- Supabase account and project
- OpenAI API key
- SendGrid account (or Supabase Email)
- IMAP access to PostgreSQL mailing list
- GitHub repository (for GitHub Actions)

## 1. Supabase Setup

### Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note down your project URL and API keys
3. Wait for the project to be fully provisioned

### Deploy Database Schema

```bash
# Link to your Supabase project
cd supabase
supabase link --project-ref YOUR_PROJECT_REF

# Deploy migrations
supabase db push

# Deploy Edge Functions
supabase functions deploy
```

### Configure Environment Variables

In your Supabase project dashboard, go to Settings > Edge Functions and add these environment variables:

```
OPENAI_API_KEY=your-openai-api-key
SENDGRID_API_KEY=your-sendgrid-api-key
IMAP_HOST=mail.postgresql.org
IMAP_USER=your-email@example.com
IMAP_PASS=your-password
IMAP_PORT=993
IMAP_TLS=true
```

## 2. Frontend Deployment

### Deploy to Vercel (Recommended)

1. Connect your GitHub repository to Vercel
2. Set environment variables in Vercel dashboard:
   ```
   VITE_SUPABASE_URL=your-supabase-url
   VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
   ```
3. Deploy automatically on push to main branch

### Deploy to Netlify

1. Connect your GitHub repository to Netlify
2. Set build command: `cd frontend && npm run build`
3. Set publish directory: `frontend/dist`
4. Set environment variables in Netlify dashboard

### Deploy to Railway

1. Connect your GitHub repository to Railway
2. Set environment variables in Railway dashboard
3. Railway will automatically detect and deploy the frontend

## 3. GitHub Actions Setup

### Configure Repository Secrets

Go to your GitHub repository > Settings > Secrets and variables > Actions, and add:

```
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OPENAI_API_KEY=your-openai-api-key
SENDGRID_API_KEY=your-sendgrid-api-key
IMAP_HOST=mail.postgresql.org
IMAP_USER=your-email@example.com
IMAP_PASS=your-password
IMAP_PORT=993
IMAP_TLS=true
```

### Test GitHub Actions

1. Go to Actions tab in your GitHub repository
2. Find the "Weekly PostgreSQL Summary Processing" workflow
3. Click "Run workflow" to test manually

## 4. Email Configuration

### SendGrid Setup

1. Create a SendGrid account
2. Generate an API key with "Mail Send" permissions
3. Verify your sender domain
4. Add the API key to your environment variables

### Alternative: Supabase Email

If you prefer to use Supabase's built-in email service:

1. Enable email in your Supabase project
2. Configure SMTP settings
3. Update the Edge Functions to use Supabase Email instead of SendGrid

## 5. IMAP Configuration

### PostgreSQL Mailing List Access

To read emails from the PostgreSQL mailing list, you need:

1. **IMAP Access**: Most mailing lists don't provide direct IMAP access
2. **Alternative Approaches**:
   - Use a service like Gmail with IMAP enabled
   - Set up email forwarding to a dedicated email account
   - Use RSS feeds if available
   - Use mailing list archives API if available

### Recommended Setup

1. Create a dedicated Gmail account
2. Subscribe to pgsql-hackers@postgresql.org
3. Enable IMAP in Gmail settings
4. Use Gmail's IMAP credentials in your environment variables

## 6. Monitoring and Maintenance

### Supabase Dashboard

- Monitor Edge Function logs
- Check database performance
- Review processing logs table

### GitHub Actions

- Monitor workflow runs
- Check for failures and errors
- Review logs for debugging

### Email Delivery

- Monitor SendGrid dashboard for delivery rates
- Check bounce and complaint rates
- Review subscriber engagement

## 7. Production Checklist

- [ ] Supabase project created and configured
- [ ] Database schema deployed
- [ ] Edge Functions deployed with environment variables
- [ ] Frontend deployed and accessible
- [ ] GitHub Actions configured with secrets
- [ ] Email service configured and tested
- [ ] IMAP access configured
- [ ] Weekly processing tested manually
- [ ] Monitoring and logging set up
- [ ] Backup strategy implemented

## 8. Troubleshooting

### Common Issues

1. **Edge Functions not working**
   - Check environment variables
   - Review function logs in Supabase dashboard
   - Test functions manually

2. **Email delivery failing**
   - Verify SendGrid API key and permissions
   - Check sender domain verification
   - Review SendGrid logs

3. **IMAP connection issues**
   - Verify IMAP credentials
   - Check firewall and network settings
   - Test with a different email client

4. **GitHub Actions failing**
   - Check repository secrets
   - Review workflow logs
   - Verify Supabase permissions

### Getting Help

- Check the logs in Supabase dashboard
- Review GitHub Actions logs
- Test individual components manually
- Check environment variable configuration

## 9. Scaling Considerations

### Database Performance

- Monitor query performance
- Add indexes as needed
- Consider read replicas for heavy loads

### Email Processing

- Implement rate limiting
- Add retry logic for failed emails
- Consider queue-based processing

### Frontend Performance

- Enable CDN caching
- Optimize images and assets
- Monitor Core Web Vitals

## 10. Security Best Practices

- Use environment variables for all secrets
- Enable Row Level Security (RLS) on all tables
- Regularly rotate API keys
- Monitor for suspicious activity
- Implement rate limiting
- Use HTTPS everywhere
- Regular security audits



