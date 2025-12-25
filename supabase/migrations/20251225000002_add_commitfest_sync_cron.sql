-- Add cron job to sync commitfest data weekly
-- This will call the sync-commitfest-data edge function via HTTP

-- Create a function that triggers the sync via HTTP call
CREATE OR REPLACE FUNCTION trigger_sync_commitfest_data()
RETURNS void AS $$
DECLARE
  request_id bigint;
  supabase_url text;
  anon_key text;
  webhook_url text;
BEGIN
  -- Get configuration from app_secrets
  supabase_url := get_app_secret('supabase_url');
  anon_key := get_app_secret('supabase_anon_key');
  
  -- Log the start of the cron job
  INSERT INTO processing_logs (process_type, status, message, metadata, started_at)
  VALUES ('cron_trigger', 'in_progress', 'Starting cron job to call sync-commitfest-data', 
          jsonb_build_object(
            'triggered_at', NOW(),
            'task_type', 'sync_commitfest_data',
            'schedule', 'weekly',
            'method', 'http_post'
          ), NOW());

  -- Update the schedule tracking
  INSERT INTO cron_schedule (task_name, schedule_expression, last_run_at, next_run_at)
  VALUES (
    'sync-commitfest-data-weekly',
    '0 2 * * 1',  -- Every Monday at 2:00 AM UTC
    NOW(),
    NOW() + INTERVAL '7 days'
  )
  ON CONFLICT (task_name) DO UPDATE SET
    last_run_at = NOW(),
    next_run_at = NOW() + INTERVAL '7 days',
    updated_at = NOW()
  WHERE cron_schedule.task_name = 'sync-commitfest-data-weekly';

  -- Make HTTP call to the Edge Function
  BEGIN
    webhook_url := supabase_url || '/functions/v1/sync-commitfest-data';
    
    -- Make async HTTP POST request to the Edge Function
    SELECT net.http_post(
      url := webhook_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || COALESCE(anon_key, '')
      ),
      body := jsonb_build_object(
        'source', 'database_cron',
        'triggered_at', NOW(),
        'cron_job', 'sync-commitfest-data-weekly'
      )
    ) INTO request_id;

    -- Log successful request initiation
    INSERT INTO processing_logs (process_type, status, message, metadata, completed_at)
    VALUES ('cron_trigger', 'success', 'HTTP request sent to sync-commitfest-data Edge Function', 
            jsonb_build_object(
              'request_id', request_id,
              'webhook_url', webhook_url,
              'method', 'http_post'
            ), NOW());

  EXCEPTION WHEN OTHERS THEN
    -- Log any errors in HTTP call
    INSERT INTO processing_logs (process_type, status, message, metadata, completed_at)
    VALUES ('cron_trigger', 'error', 'Failed to call sync-commitfest-data: ' || SQLERRM, 
            jsonb_build_object(
              'error_detail', SQLSTATE,
              'webhook_url', webhook_url,
              'error_message', SQLERRM
            ), NOW());
  END;

END;
$$ LANGUAGE plpgsql;

-- Schedule the function to run every Monday at 2:00 AM UTC
-- Format: minute hour day month day_of_week
-- 0 2 * * 1 means: at minute 0, hour 2, every day of month, every month, on Monday (1)
SELECT cron.schedule(
  'sync-commitfest-data-weekly',
  '0 2 * * 1',  -- Every Monday at 2:00 AM UTC
  'SELECT trigger_sync_commitfest_data();'
);

-- Add comment explaining the schedule
COMMENT ON FUNCTION trigger_sync_commitfest_data() IS 
  'Triggers commitfest data sync. Called by cron job every Monday at 2am UTC. The actual sync is performed by the sync-commitfest-data edge function.';

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION trigger_sync_commitfest_data() TO postgres, anon, authenticated;

