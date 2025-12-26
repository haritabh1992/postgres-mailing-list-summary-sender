# 🚀 Deployment Guide for postgreshackersdigest.dev

## Prerequisites

1. **Domain Registration**: Purchase `postgreshackersdigest.dev` from a registrar like:
   - [Namecheap](https://www.namecheap.com/) (~$12/year)
   - [Google Domains](https://domains.google/) (~$12/year)
   - [Cloudflare Registrar](https://www.cloudflare.com/products/registrar/) (~$9/year)

2. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)

3. **Supabase Project**: Ensure your Supabase project is deployed and configured

## Step 1: Deploy to Vercel

### Option A: Deploy via Vercel CLI (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy from project root
vercel

# Follow the prompts:
# - Set up and deploy? Y
# - Which scope? [Your account]
# - Link to existing project? N
# - Project name: postgres-hackers-digest
# - Directory: ./frontend
# - Override settings? N
```

### Option B: Deploy via GitHub Integration

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com)
3. Click "New Project"
4. Import your GitHub repository
5. Configure:
   - **Framework Preset**: Vite
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`

## Step 2: Configure Environment Variables

In your Vercel dashboard:

1. Go to Project Settings → Environment Variables
2. Add these variables:

```
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

## Step 3: Set Up Custom Domain

### In Vercel Dashboard:

1. Go to Project Settings → Domains
2. Add `postgreshackersdigest.dev`
3. Add `www.postgreshackersdigest.dev`
4. Copy the DNS records provided by Vercel

### In Your Domain Registrar:

Add these DNS records:

```
Type: A
Name: @
Value: 76.76.19.19

Type: CNAME  
Name: www
Value: cname.vercel-dns.com
```

## Step 4: Configure Supabase

### Update Supabase Settings:

1. Go to Supabase Dashboard → Settings → API
2. Add your domain to **Site URL**:
   ```
   https://postgreshackersdigest.dev
   ```

3. Add to **Additional Redirect URLs**:
   ```
   https://www.postgreshackersdigest.dev
   ```

### Update Supabase Functions:

Ensure all Edge Functions are properly deployed and configured.

## Step 5: Test Deployment

1. **Visit your site**: https://postgreshackersdigest.dev
2. **Test subscription**: Try subscribing with a test email
3. **Test unsubscribe**: Verify unsubscribe functionality
4. **Check SSL**: Ensure HTTPS is working
5. **Test mobile**: Verify responsive design

## Step 6: Set Up Monitoring

### Vercel Analytics (Optional):
1. Enable Vercel Analytics in project settings
2. Monitor performance and usage

### Uptime Monitoring:
Consider setting up monitoring with:
- [UptimeRobot](https://uptimerobot.com/) (Free)
- [Pingdom](https://www.pingdom.com/) (Paid)

## Step 7: SEO Optimization

### Add to frontend/index.html:
```html
<meta property="og:title" content="PostgreSQL Hackers Digest">
<meta property="og:description" content="AI-powered weekly summaries of PostgreSQL hackers mailing list">
<meta property="og:url" content="https://postgreshackersdigest.dev">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
```

## Troubleshooting

### Common Issues:

1. **DNS Propagation**: Can take up to 48 hours
2. **SSL Certificate**: Usually automatic with Vercel
3. **Environment Variables**: Ensure all are set correctly
4. **Supabase CORS**: Check domain is added to allowed origins

### Useful Commands:

```bash
# Check DNS propagation
nslookup postgreshackersdigest.dev

# Test SSL
curl -I https://postgreshackersdigest.dev

# Redeploy
vercel --prod
```

## Success! 🎉

Your PostgreSQL Hackers Digest should now be live at:
**https://postgreshackersdigest.dev**

Remember to:
- Monitor your Supabase usage
- Set up email notifications for errors
- Regularly backup your database
- Keep dependencies updated
