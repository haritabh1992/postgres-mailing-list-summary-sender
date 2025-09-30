# PostgreSQL Mailing List Summary Sender

A fully automated service that sends weekly AI-powered summaries of PostgreSQL mailing list discussions to subscribers.

## 🎯 Features

- **📧 Automated Email Summaries**: Weekly AI-generated summaries of PostgreSQL mailing list discussions
- **🤖 AI-Powered**: Uses OpenAI GPT-3.5-turbo to create intelligent summaries
- **📱 Modern Web Interface**: React + TypeScript frontend with beautiful UI
- **🔐 Secure Subscription**: Email confirmation required for subscriptions
- **📊 Real-time Stats**: Live subscriber and summary counts
- **⚡ Fully Automated**: Complete pipeline runs every night at midnight UTC
- **🛡️ Production Ready**: Built on Supabase with proper security and monitoring

## 🏗️ Architecture

```
Frontend (React) → Supabase (PostgreSQL + Edge Functions) → External APIs
     ↓                    ↓                                      ↓
  User Interface    Database + Serverless Functions    OpenAI + SendGrid + IMAP
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- Supabase CLI
- Git

### 1. Clone and Setup

```bash
git clone <your-repo-url>
cd postgres-mailing-list-summary-sender
./setup.sh
```

### 2. Environment Configuration

Copy `env.example` to `frontend/.env.local` and configure:

```bash
cp env.example frontend/.env.local
```

Required environment variables:
- `VITE_SUPABASE_URL` - Your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Your Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key
- `OPENAI_API_KEY` - OpenAI API key for AI summarization
- `SENDGRID_API_KEY` or `RESEND_API_KEY` - Email delivery service
- `IMAP_*` - IMAP credentials for reading mailing list

### 3. Start Development

```bash
npm run dev
```

This will start:
- Frontend at http://localhost:5173
- Supabase Studio at http://localhost:54323

## 📋 Complete Pipeline

The system runs a 4-step automated pipeline every night at midnight UTC:

1. **📧 Fetch Mail Threads** - Gets thread URLs from PostgreSQL archives
2. **📄 Fetch Thread Content** - Downloads full email content (repeats until complete)
3. **🤖 Generate AI Summary** - Creates intelligent summary using OpenAI
4. **📤 Send Summary Emails** - Delivers beautiful HTML emails to subscribers

## 🛠️ Development

### Project Structure

```
├── frontend/                 # React + TypeScript frontend
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── pages/          # Page components
│   │   ├── hooks/          # Custom React hooks
│   │   └── lib/            # Utilities and types
│   └── public/             # Static assets
├── supabase/               # Supabase backend
│   ├── functions/          # Edge Functions
│   ├── migrations/         # Database migrations
│   └── config.toml         # Supabase configuration
└── docs/                   # Documentation
```

### Available Scripts

```bash
# Development
npm run dev                 # Start both frontend and Supabase
npm run dev:frontend        # Start only frontend
npm run dev:supabase        # Start only Supabase

# Building
npm run build               # Build frontend for production
npm run build:frontend      # Build frontend only

# Database
npm run db:reset            # Reset database
npm run db:migrate          # Apply migrations

# Deployment
npm run deploy              # Deploy all functions
npm run deploy:supabase     # Deploy Supabase functions only
```

### Testing

The frontend includes a comprehensive dev panel (development only) with buttons to test:
- Database connections
- Email functions
- AI summary generation
- Full pipeline execution
- Cron job testing

## 🚀 Deployment

### 1. Supabase Setup

1. Create a new Supabase project
2. Run migrations: `supabase db push`
3. Set up Edge Functions: `supabase functions deploy`
4. Configure secrets in Supabase dashboard

### 2. Frontend Deployment

Deploy to Vercel, Netlify, or any static hosting:

```bash
cd frontend
npm run build
# Deploy the dist/ folder
```

### 3. Environment Variables

Set these in your hosting platform:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### 4. Automation

The system includes automated cron jobs that run every night. No additional setup needed!

## 📊 Database Schema

### Core Tables

- **`subscribers`** - Email subscription management with confirmation
- **`mailing_list_posts`** - Raw email data from PostgreSQL mailing list
- **`mail_threads`** - Thread metadata and URLs
- **`weekly_discussions`** - Weekly discussion groupings
- **`weekly_summaries`** - Generated AI summaries
- **`processing_logs`** - System monitoring and debugging
- **`cron_schedule`** - Cron job tracking

### Key Features

- Row Level Security (RLS) enabled
- Automatic timestamp updates
- Optimized indexes for performance
- Comprehensive logging

## 🔧 Configuration

### Email Services

The system supports multiple email providers:
- **Resend** (recommended for development)
- **SendGrid** (production-ready)
- **Supabase Email** (basic)

### AI Configuration

- **OpenAI GPT-3.5-turbo** for summarization
- Configurable prompt templates
- Token usage monitoring

### IMAP Configuration

Configure IMAP settings to read from PostgreSQL mailing list:
- Host: `mail.postgresql.org`
- Port: 993 (TLS)
- Authentication required

## 📈 Monitoring

### Built-in Monitoring

- **Processing Logs**: Track all operations
- **Cron Job Status**: Monitor automated tasks
- **Pipeline History**: View execution results
- **Error Tracking**: Comprehensive error logging

### Supabase Dashboard

Monitor your application:
- Database performance
- Edge Function logs
- Real-time metrics
- Error tracking

## 🛡️ Security

- **Row Level Security**: Database-level access control
- **Email Confirmation**: Prevents unauthorized subscriptions
- **API Key Management**: Secure secret handling
- **CORS Configuration**: Proper cross-origin setup
- **Input Validation**: Zod schema validation

## 📚 Documentation

- [Deployment Guide](DEPLOYMENT.md) - Complete deployment instructions
- [Cron Setup](CRON_SETUP.md) - Automated scheduling configuration
- [Project Status](PROJECT_STATUS.md) - Current feature status

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For issues and questions:
1. Check the documentation
2. Review the logs in Supabase dashboard
3. Open an issue on GitHub

## 🎉 What's Next?

The system is production-ready with:
- ✅ Complete automation
- ✅ Beautiful UI
- ✅ AI-powered summaries
- ✅ Secure subscriptions
- ✅ Comprehensive monitoring
- ✅ Scalable architecture

**Your PostgreSQL Weekly Summary service is ready to go live!** 🚀
