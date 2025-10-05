-- Fix any remaining references to mailing_list_posts table
-- This migration ensures all functions use mail_threads instead

-- Drop and recreate get_weekly_stats to use mail_threads
DROP FUNCTION IF EXISTS get_weekly_stats(DATE);

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

-- Drop and recreate get_top_discussions to use mail_threads
DROP FUNCTION IF EXISTS get_top_discussions(DATE, INTEGER);

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
    COUNT(mt.id) as post_count,
    COUNT(DISTINCT mt.thread_id) as participants,
    MIN(mt.post_date) as first_post_at,
    MAX(mt.post_date) as last_post_at
  FROM mail_threads mt
  WHERE mt.post_date >= week_start 
    AND mt.post_date < week_start + INTERVAL '7 days'
  GROUP BY mt.thread_id, mt.subject
  ORDER BY post_count DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Log the fix
INSERT INTO processing_logs (process_type, status, message, metadata, completed_at)
VALUES (
  'migration_fix',
  'success',
  'Fixed remaining mailing_list_posts references to use mail_threads',
  jsonb_build_object(
    'migration', '20240101000025_fix_mailing_list_posts_references',
    'fixed_functions', jsonb_build_array('get_weekly_stats', 'get_top_discussions')
  ),
  NOW()
);

