-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create subscribers table
CREATE TABLE subscribers (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  subscribed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create mailing_list_posts table
CREATE TABLE mailing_list_posts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  message_id VARCHAR(255) UNIQUE NOT NULL,
  subject TEXT,
  author_email VARCHAR(255),
  content TEXT,
  thread_id VARCHAR(255),
  posted_at TIMESTAMP WITH TIME ZONE,
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create weekly_summaries table
CREATE TABLE weekly_summaries (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  week_start_date DATE,
  week_end_date DATE,
  summary_content TEXT,
  top_discussions JSONB,
  total_posts INTEGER DEFAULT 0,
  total_participants INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create processing_logs table for monitoring
CREATE TABLE processing_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  process_type VARCHAR(50) NOT NULL, -- 'email_fetch', 'summary_generation', 'email_send'
  status VARCHAR(20) NOT NULL, -- 'success', 'error', 'in_progress'
  message TEXT,
  metadata JSONB,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_subscribers_email ON subscribers(email);
CREATE INDEX idx_subscribers_active ON subscribers(is_active);
CREATE INDEX idx_mailing_list_posts_message_id ON mailing_list_posts(message_id);
CREATE INDEX idx_mailing_list_posts_thread_id ON mailing_list_posts(thread_id);
CREATE INDEX idx_mailing_list_posts_posted_at ON mailing_list_posts(posted_at);
CREATE INDEX idx_weekly_summaries_week_start ON weekly_summaries(week_start_date);
CREATE INDEX idx_processing_logs_type_status ON processing_logs(process_type, status);

-- Enable Row Level Security (RLS)
ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE mailing_list_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for subscribers table
-- Allow public to insert new subscriptions
CREATE POLICY "Allow public subscription" ON subscribers
  FOR INSERT WITH CHECK (true);

-- Allow public to read active subscribers (for admin purposes)
CREATE POLICY "Allow public read active subscribers" ON subscribers
  FOR SELECT USING (is_active = true);

-- Allow public to update subscription status (for unsubscribe)
CREATE POLICY "Allow public unsubscribe" ON subscribers
  FOR UPDATE USING (true);

-- RLS Policies for mailing_list_posts table
-- Allow public to read posts
CREATE POLICY "Allow public read posts" ON mailing_list_posts
  FOR SELECT USING (true);

-- Allow service role to insert/update posts
CREATE POLICY "Allow service role manage posts" ON mailing_list_posts
  FOR ALL USING (auth.role() = 'service_role');

-- RLS Policies for weekly_summaries table
-- Allow public to read summaries
CREATE POLICY "Allow public read summaries" ON weekly_summaries
  FOR SELECT USING (true);

-- Allow service role to manage summaries
CREATE POLICY "Allow service role manage summaries" ON weekly_summaries
  FOR ALL USING (auth.role() = 'service_role');

-- RLS Policies for processing_logs table
-- Allow service role to manage logs
CREATE POLICY "Allow service role manage logs" ON processing_logs
  FOR ALL USING (auth.role() = 'service_role');

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers to automatically update updated_at
CREATE TRIGGER update_subscribers_updated_at BEFORE UPDATE ON subscribers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_mailing_list_posts_updated_at BEFORE UPDATE ON mailing_list_posts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_weekly_summaries_updated_at BEFORE UPDATE ON weekly_summaries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to get weekly summary stats
CREATE OR REPLACE FUNCTION get_weekly_stats(week_start DATE)
RETURNS TABLE (
  total_subscribers BIGINT,
  total_posts BIGINT,
  total_participants BIGINT,
  summary_exists BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (SELECT COUNT(*) FROM subscribers WHERE is_active = true) as total_subscribers,
    (SELECT COUNT(*) FROM mailing_list_posts 
     WHERE posted_at >= week_start AND posted_at < week_start + INTERVAL '7 days') as total_posts,
    (SELECT COUNT(DISTINCT author_email) FROM mailing_list_posts 
     WHERE posted_at >= week_start AND posted_at < week_start + INTERVAL '7 days') as total_participants,
    (SELECT EXISTS(SELECT 1 FROM weekly_summaries WHERE week_start_date = week_start)) as summary_exists;
END;
$$ LANGUAGE plpgsql;

-- Create function to get top discussions for a week
CREATE OR REPLACE FUNCTION get_top_discussions(week_start DATE, limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
  thread_id VARCHAR(255),
  subject TEXT,
  post_count BIGINT,
  participants BIGINT,
  first_post_at TIMESTAMP WITH TIME ZONE,
  last_post_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mlp.thread_id,
    mlp.subject,
    COUNT(*) as post_count,
    COUNT(DISTINCT mlp.author_email) as participants,
    MIN(mlp.posted_at) as first_post_at,
    MAX(mlp.posted_at) as last_post_at
  FROM mailing_list_posts mlp
  WHERE mlp.posted_at >= week_start 
    AND mlp.posted_at < week_start + INTERVAL '7 days'
    AND mlp.thread_id IS NOT NULL
  GROUP BY mlp.thread_id, mlp.subject
  ORDER BY post_count DESC, participants DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;
