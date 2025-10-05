-- Remove redundant mailing_list_posts table
-- This table was part of the initial design but is no longer used
-- The current pipeline uses mail_threads + weekly_discussions + weekly_summaries

-- First, check if there are any dependencies
-- Drop any functions that might reference mailing_list_posts
DROP FUNCTION IF EXISTS get_weekly_stats(DATE);
DROP FUNCTION IF EXISTS get_top_discussions(DATE, INTEGER);

-- Drop indexes related to mailing_list_posts
DROP INDEX IF EXISTS idx_mailing_list_posts_message_id;
DROP INDEX IF EXISTS idx_mailing_list_posts_thread_id;
DROP INDEX IF EXISTS idx_mailing_list_posts_posted_at;

-- Drop triggers related to mailing_list_posts
DROP TRIGGER IF EXISTS update_mailing_list_posts_updated_at ON mailing_list_posts;

-- Drop RLS policies for mailing_list_posts
DROP POLICY IF EXISTS "Allow public read posts" ON mailing_list_posts;
DROP POLICY IF EXISTS "Allow service role manage posts" ON mailing_list_posts;

-- Disable RLS on mailing_list_posts
ALTER TABLE mailing_list_posts DISABLE ROW LEVEL SECURITY;

-- Drop the table
DROP TABLE IF EXISTS mailing_list_posts;

-- Recreate the get_weekly_stats function to work with mail_threads instead
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
    (SELECT COUNT(*) FROM mail_threads 
     WHERE post_date >= week_start AND post_date < week_start + INTERVAL '7 days') as total_posts,
    (SELECT COUNT(DISTINCT thread_id) FROM mail_threads 
     WHERE post_date >= week_start AND post_date < week_start + INTERVAL '7 days') as total_participants,
    (SELECT EXISTS(SELECT 1 FROM weekly_summaries WHERE week_start_date = week_start)) as summary_exists;
END;
$$ LANGUAGE plpgsql;

-- Recreate the get_top_discussions function to work with mail_threads instead
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
    mt.thread_id,
    mt.subject,
    COUNT(*) as post_count,
    COUNT(DISTINCT mt.thread_id) as participants,
    MIN(mt.post_date) as first_post_at,
    MAX(mt.post_date) as last_post_at
  FROM mail_threads mt
  WHERE mt.post_date >= week_start 
    AND mt.post_date < week_start + INTERVAL '7 days'
  GROUP BY mt.thread_id, mt.subject
  ORDER BY COUNT(*) DESC, MAX(mt.post_date) DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Create a function to show the simplified schema
CREATE OR REPLACE FUNCTION show_simplified_schema()
RETURNS TABLE(
  table_name text,
  purpose text,
  key_columns text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    'subscribers'::text as table_name,
    'User email subscriptions and confirmation status'::text as purpose,
    'id, email, confirmation_status, is_active'::text as key_columns
  UNION ALL
  SELECT 
    'mail_threads'::text as table_name,
    'Individual mail thread metadata and URLs'::text as purpose,
    'id, thread_url, subject, post_date, is_processed'::text as key_columns
  UNION ALL
  SELECT 
    'weekly_discussions'::text as table_name,
    'Processing pipeline state for weekly data collection'::text as purpose,
    'id, week_start_date, processing_status, consolidated_content'::text as key_columns
  UNION ALL
  SELECT 
    'weekly_summaries'::text as table_name,
    'Final AI-generated summaries for email distribution'::text as purpose,
    'id, week_start_date, summary_content, top_discussions'::text as key_columns
  UNION ALL
  SELECT 
    'processing_logs'::text as table_name,
    'System operation logs and monitoring'::text as purpose,
    'id, process_type, status, message, started_at'::text as key_columns
  UNION ALL
  SELECT 
    'cron_schedule'::text as table_name,
    'Cron job execution tracking'::text as purpose,
    'id, task_name, schedule_expression, last_run_at'::text as key_columns
  UNION ALL
  SELECT 
    'app_secrets'::text as table_name,
    'Secure configuration storage'::text as purpose,
    'key, value, description'::text as key_columns;
END;
$$ LANGUAGE plpgsql;

-- Log the cleanup
INSERT INTO processing_logs (process_type, status, message, metadata, started_at, completed_at)
VALUES (
  'schema_cleanup', 
  'success', 
  'Removed redundant mailing_list_posts table and updated related functions',
  jsonb_build_object(
    'removed_table', 'mailing_list_posts',
    'updated_functions', jsonb_build_array('get_weekly_stats', 'get_top_discussions'),
    'new_function', 'show_simplified_schema',
    'tables_remaining', 7
  ),
  NOW(),
  NOW()
);
