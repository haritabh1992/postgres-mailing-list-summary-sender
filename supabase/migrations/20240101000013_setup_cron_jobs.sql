-- Enable pg_cron extension for scheduled tasks
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a table to track scheduled tasks
CREATE TABLE IF NOT EXISTS cron_schedule (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  task_name VARCHAR(100) UNIQUE NOT NULL,
  schedule_expression VARCHAR(50) NOT NULL,
  next_run_at TIMESTAMP WITH TIME ZONE,
  last_run_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create a function that will be called by the cron job
-- This function will insert a trigger record that can be picked up by external systems
CREATE OR REPLACE FUNCTION trigger_fetch_mail_threads()
RETURNS void AS $$
BEGIN
  -- Log the cron job execution
  INSERT INTO processing_logs (process_type, status, message, metadata, started_at)
  VALUES ('cron_trigger', 'success', 'Cron job triggered fetch-mail-threads', 
          jsonb_build_object(
            'triggered_at', NOW(),
            'task_type', 'fetch_mail_threads',
            'schedule', 'nightly_midnight'
          ), NOW());

  -- Update the schedule tracking
  INSERT INTO cron_schedule (task_name, schedule_expression, last_run_at, next_run_at)
  VALUES (
    'fetch-mail-threads-nightly',
    '0 0 * * *',
    NOW(),
    NOW() + INTERVAL '1 day'
  )
  ON CONFLICT (task_name) DO UPDATE SET
    last_run_at = NOW(),
    next_run_at = NOW() + INTERVAL '1 day',
    updated_at = NOW()
  WHERE cron_schedule.task_name = 'fetch-mail-threads-nightly';

  -- You can add webhook call here if needed
  -- For now, this creates a log entry that external systems can monitor
END;
$$ LANGUAGE plpgsql;

-- Schedule the function to run every night at midnight (UTC)
-- Format: minute hour day month day_of_week
SELECT cron.schedule(
  'fetch-mail-threads-nightly',
  '0 0 * * *',  -- Every day at midnight UTC
  'SELECT trigger_fetch_mail_threads();'
);

-- Create a function to manually test the cron trigger
CREATE OR REPLACE FUNCTION test_cron_trigger()
RETURNS text AS $$
BEGIN
  PERFORM trigger_fetch_mail_threads();
  RETURN 'Cron trigger test executed at ' || NOW() || '. Check processing_logs table for details.';
END;
$$ LANGUAGE plpgsql;

-- Create a function to view cron job status
CREATE OR REPLACE FUNCTION get_cron_status()
RETURNS TABLE (
  jobname text,
  schedule text,
  active boolean,
  last_run timestamp with time zone,
  next_run timestamp with time zone
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cj.jobname::text,
    cj.schedule::text,
    cj.active,
    cs.last_run_at,
    cs.next_run_at
  FROM cron.job cj
  LEFT JOIN cron_schedule cs ON cj.jobname = cs.task_name
  WHERE cj.jobname = 'fetch-mail-threads-nightly';
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION trigger_fetch_mail_threads() TO postgres, anon, authenticated;
GRANT EXECUTE ON FUNCTION test_cron_trigger() TO postgres, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_cron_status() TO postgres, anon, authenticated;
GRANT SELECT ON cron_schedule TO anon, authenticated;
GRANT SELECT ON processing_logs TO anon, authenticated;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_cron_schedule_task_name ON cron_schedule(task_name);
CREATE INDEX IF NOT EXISTS idx_processing_logs_cron ON processing_logs(process_type, started_at) WHERE process_type = 'cron_trigger';
