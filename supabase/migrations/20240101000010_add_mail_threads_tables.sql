-- Create table to store individual mail threads
CREATE TABLE mail_threads (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  thread_url VARCHAR(500) NOT NULL UNIQUE,
  subject TEXT,
  author_name VARCHAR(255),
  author_email VARCHAR(255),
  post_date TIMESTAMP WITH TIME ZONE,
  thread_id VARCHAR(255), -- For grouping related messages
  message_count INTEGER DEFAULT 1,
  first_message_url VARCHAR(500),
  last_activity TIMESTAMP WITH TIME ZONE,
  is_processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create table to store consolidated weekly discussions
CREATE TABLE weekly_discussions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  week_start_date DATE NOT NULL,
  week_end_date DATE NOT NULL,
  total_threads INTEGER DEFAULT 0,
  total_messages INTEGER DEFAULT 0,
  top_threads JSONB, -- Store top discussion threads with metadata
  consolidated_content TEXT, -- The big document with all discussions
  content_summary TEXT, -- AI-generated summary of the week's discussions
  processing_status VARCHAR(20) DEFAULT 'pending' CHECK (processing_status IN ('pending', 'fetching', 'processing', 'completed', 'failed')),
  fetch_started_at TIMESTAMP WITH TIME ZONE,
  fetch_completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(week_start_date, week_end_date)
);

-- Create indexes for better performance
CREATE INDEX idx_mail_threads_post_date ON mail_threads(post_date);
CREATE INDEX idx_mail_threads_thread_id ON mail_threads(thread_id);
CREATE INDEX idx_mail_threads_is_processed ON mail_threads(is_processed);
CREATE INDEX idx_weekly_discussions_week_start ON weekly_discussions(week_start_date);
CREATE INDEX idx_weekly_discussions_status ON weekly_discussions(processing_status);

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_mail_threads_updated_at BEFORE UPDATE ON mail_threads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_weekly_discussions_updated_at BEFORE UPDATE ON weekly_discussions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to get current week's mail threads
CREATE OR REPLACE FUNCTION get_current_week_threads()
RETURNS TABLE (
  thread_count BIGINT,
  message_count BIGINT,
  oldest_thread TIMESTAMP WITH TIME ZONE,
  newest_thread TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE
  week_start DATE;
  week_end DATE;
BEGIN
  -- Get current week boundaries (Monday to Sunday)
  week_start := date_trunc('week', CURRENT_DATE);
  week_end := week_start + INTERVAL '6 days';
  
  RETURN QUERY
  SELECT 
    COUNT(*) as thread_count,
    SUM(message_count) as message_count,
    MIN(post_date) as oldest_thread,
    MAX(post_date) as newest_thread
  FROM mail_threads 
  WHERE post_date >= week_start 
    AND post_date <= week_end + INTERVAL '1 day';
END;
$$ LANGUAGE plpgsql;

-- Grant permissions for anonymous access to read functions
GRANT EXECUTE ON FUNCTION get_current_week_threads() TO anon;
