-- Update trigger_sync_commitfest_data function to reflect 6-hour schedule in tracking

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
            'schedule', 'every_6_hours',
            'method', 'http_post'
          ), NOW());

  -- Update the schedule tracking with 6-hour interval
  INSERT INTO cron_schedule (task_name, schedule_expression, last_run_at, next_run_at)
  VALUES (
    'sync-commitfest-data-weekly',
    '0 */6 * * *',  -- Every 6 hours
    NOW(),
    NOW() + INTERVAL '6 hours'
  )
  ON CONFLICT (task_name) DO UPDATE SET
    last_run_at = NOW(),
    next_run_at = NOW() + INTERVAL '6 hours',
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

