-- Update the nightly summary cron job to run weekly on Fridays at 8am UTC
-- This changes from daily midnight to weekly Friday morning

-- First, unschedule the old daily job
SELECT cron.unschedule('nightly-summary-send');

-- Schedule the new weekly job for Fridays at 8am UTC
SELECT cron.schedule(
  'nightly-summary-send',
  '0 8 * * 5',  -- Every Friday at 8am UTC (5 = Friday)
  'SELECT trigger_nightly_summary_send();'
);

-- Update the function to reflect the new weekly schedule
CREATE OR REPLACE FUNCTION trigger_nightly_summary_send()
RETURNS void AS $$
DECLARE
  webhook_url text;
  cron_secret text;
  request_id bigint;
  anon_key text;
BEGIN
  -- Get configuration
  webhook_url := get_app_secret('supabase_url') || '/functions/v1/cron-webhook';
  cron_secret := get_app_secret('cron_webhook_secret');
  anon_key := get_app_secret('supabase_anon_key');
  
  -- Log the start of the weekly summary and send
  INSERT INTO processing_logs (process_type, status, message, metadata, started_at)
  VALUES ('cron_nightly_summary', 'in_progress', 'Starting weekly summary: generate + send', 
          jsonb_build_object(
            'triggered_at', NOW(),
            'task_type', 'weekly_summary',
            'schedule', 'friday_8am_utc',
            'method', 'webhook_call',
            'steps', jsonb_build_array('generate-summary', 'send-summary')
          ), NOW());

  -- Update the schedule tracking for weekly summary
  INSERT INTO cron_schedule (task_name, schedule_expression, last_run_at, next_run_at)
  VALUES (
    'nightly-summary-send',
    '0 8 * * 5',  -- Friday 8am UTC
    NOW(),
    -- Calculate next Friday 8am UTC
    DATE_TRUNC('week', NOW() + INTERVAL '1 week') + INTERVAL '5 days' + INTERVAL '8 hours'
  )
  ON CONFLICT (task_name) DO UPDATE SET
    last_run_at = NOW(),
    next_run_at = DATE_TRUNC('week', NOW() + INTERVAL '1 week') + INTERVAL '5 days' + INTERVAL '8 hours',
    updated_at = NOW(),
    schedule_expression = '0 8 * * 5'
  WHERE cron_schedule.task_name = 'nightly-summary-send';

  -- Make HTTP call to the webhook for weekly summary
  BEGIN
    -- Construct the webhook URL for weekly summary
    webhook_url := webhook_url || '?task=nightly-summary&secret=' || cron_secret;
    
    -- Make async HTTP GET request to run the weekly summary
    SELECT net.http_get(
      url := webhook_url,
      headers := jsonb_build_object(
        'User-Agent', 'PostgreSQL-Cron-Pipeline/1.0',
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || anon_key
      ),
      timeout_milliseconds := 15000  -- 15 second timeout for summary generation
    ) INTO request_id;

    -- Log successful weekly summary request initiation
    INSERT INTO processing_logs (process_type, status, message, metadata, completed_at)
    VALUES ('cron_nightly_summary', 'success', 'HTTP webhook request sent for weekly summary', 
            jsonb_build_object(
              'request_id', request_id,
              'webhook_url', get_app_secret('supabase_url') || '/functions/v1/cron-webhook?task=nightly-summary&secret=[HIDDEN]',
              'method', 'http_get',
              'schedule', 'friday_8am_utc',
              'pipeline_steps', jsonb_build_array('generate-summary', 'send-summary')
            ), NOW());

  EXCEPTION WHEN OTHERS THEN
    -- Log any errors that occur during the webhook call
    INSERT INTO processing_logs (process_type, status, message, metadata, completed_at)
    VALUES ('cron_nightly_summary', 'error', 'Failed to call weekly summary webhook: ' || SQLERRM, 
            jsonb_build_object(
              'error_details', SQLERRM,
              'webhook_url', get_app_secret('supabase_url') || '/functions/v1/cron-webhook?task=nightly-summary&secret=[HIDDEN]',
              'schedule', 'friday_8am_utc'
            ), NOW());
    
    -- Re-raise the exception
    RAISE;
  END;
END;
$$ LANGUAGE plpgsql;

-- Update the test function to reflect the new schedule
CREATE OR REPLACE FUNCTION test_nightly_cron()
RETURNS text AS $$
DECLARE
  result text;
BEGIN
  -- Call the function manually
  PERFORM trigger_nightly_summary_send();
  
  -- Get the latest result
  SELECT message INTO result
  FROM processing_logs 
  WHERE process_type = 'cron_nightly_summary' 
  ORDER BY started_at DESC 
  LIMIT 1;
  
  RETURN 'Weekly cron test executed. Latest result: ' || COALESCE(result, 'No logs found');
END;
$$ LANGUAGE plpgsql;

-- Create a function to show the updated cron configuration
CREATE OR REPLACE FUNCTION show_weekly_cron_config()
RETURNS TABLE(
  job_name text,
  schedule text,
  description text,
  next_run_estimate text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    'nightly-summary-send'::text as job_name,
    '0 8 * * 5'::text as schedule,
    'Weekly summary generation and email sending every Friday at 8am UTC'::text as description,
    'Next Friday 8am UTC'::text as next_run_estimate;
END;
$$ LANGUAGE plpgsql;

-- Add a comment explaining the change
COMMENT ON FUNCTION trigger_nightly_summary_send() IS 'Triggers weekly summary generation and email sending every Friday at 8am UTC. Changed from daily midnight schedule.';
COMMENT ON FUNCTION show_weekly_cron_config() IS 'Shows the current weekly cron configuration for summary generation.';
