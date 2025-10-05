-- Drop the existing function to avoid signature conflicts
DROP FUNCTION IF EXISTS show_webhook_config();

-- Update the cron function to run the complete pipeline
CREATE OR REPLACE FUNCTION trigger_full_pipeline()
RETURNS void AS $$
DECLARE
  request_id bigint;
  webhook_url text;
  cron_secret text;
BEGIN
  -- Set the webhook URL and secret for full pipeline
  webhook_url := get_app_secret('supabase_url') || '/functions/v1/cron-webhook';
  cron_secret := get_app_secret('cron_webhook_secret');
  
  -- Log the start of the full pipeline cron job
  INSERT INTO processing_logs (process_type, status, message, metadata, started_at)
  VALUES ('cron_full_pipeline', 'in_progress', 'Starting nightly full pipeline: fetch → generate → send', 
          jsonb_build_object(
            'triggered_at', NOW(),
            'task_type', 'full_pipeline',
            'schedule', 'nightly_midnight',
            'method', 'webhook_call',
            'steps', jsonb_build_array('fetch-mail-threads', 'fetch-thread-content', 'generate-summary', 'send-summary')
          ), NOW());

  -- Update the schedule tracking for full pipeline
  INSERT INTO cron_schedule (task_name, schedule_expression, last_run_at, next_run_at)
  VALUES (
    'full-pipeline-nightly',
    '0 0 * * *',
    NOW(),
    NOW() + INTERVAL '1 day'
  )
  ON CONFLICT (task_name) DO UPDATE SET
    last_run_at = NOW(),
    next_run_at = NOW() + INTERVAL '1 day',
    updated_at = NOW()
  WHERE cron_schedule.task_name = 'full-pipeline-nightly';

  -- Make HTTP call to the webhook for full pipeline
  BEGIN
    -- Construct the webhook URL for full pipeline
    webhook_url := webhook_url || '?task=full-pipeline&secret=' || cron_secret;
    
    -- Make async HTTP GET request to run the full pipeline (fire and forget)
    SELECT net.http_get(
      url := webhook_url,
      headers := jsonb_build_object(
        'User-Agent', 'PostgreSQL-Cron-Pipeline/1.0',
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || get_app_secret('supabase_anon_key')
      ),
      timeout_milliseconds := 5000  -- Short timeout, just to trigger the function
    ) INTO request_id;

    -- Log successful pipeline request initiation
    INSERT INTO processing_logs (process_type, status, message, metadata, completed_at)
    VALUES ('cron_full_pipeline', 'success', 'HTTP webhook request sent for full pipeline execution', 
            jsonb_build_object(
              'request_id', request_id,
              'webhook_url', get_app_secret('supabase_url') || '/functions/v1/cron-webhook?task=full-pipeline&secret=[HIDDEN]',
              'method', 'http_get',
              'pipeline_steps', jsonb_build_array('fetch-mail-threads', 'fetch-thread-content', 'generate-summary', 'send-summary')
            ), NOW());

  EXCEPTION WHEN OTHERS THEN
    -- Log any errors in HTTP call
    INSERT INTO processing_logs (process_type, status, message, metadata, completed_at)
    VALUES ('cron_full_pipeline', 'error', 'Failed to call full pipeline webhook: ' || SQLERRM, 
            jsonb_build_object(
              'error_detail', SQLSTATE,
              'webhook_url', get_app_secret('supabase_url') || '/functions/v1/cron-webhook?task=full-pipeline&secret=[HIDDEN]',
              'error_message', SQLERRM
            ), NOW());
  END;

END;
$$ LANGUAGE plpgsql;

-- Update the existing cron job to use the full pipeline instead
-- First, unschedule the old job
SELECT cron.unschedule('fetch-mail-threads-nightly');

-- Schedule the new full pipeline job
SELECT cron.schedule(
  'full-pipeline-nightly',
  '0 0 * * *',  -- Every day at midnight UTC
  'SELECT trigger_full_pipeline();'
);

-- Create a test function for the full pipeline
CREATE OR REPLACE FUNCTION test_full_pipeline_cron()
RETURNS text AS $$
DECLARE
  result text;
BEGIN
  PERFORM trigger_full_pipeline();
  
  -- Check the latest log entry
  SELECT message INTO result 
  FROM processing_logs 
  WHERE process_type = 'cron_full_pipeline' 
  ORDER BY started_at DESC 
  LIMIT 1;
  
  RETURN 'Full pipeline cron test executed. Latest result: ' || COALESCE(result, 'No logs found');
END;
$$ LANGUAGE plpgsql;

-- Recreate the webhook config function with new signature
CREATE OR REPLACE FUNCTION show_webhook_config()
RETURNS table(
  current_webhook_url text,
  cron_status text,
  last_execution timestamp with time zone,
  next_execution timestamp with time zone,
  pipeline_type text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (get_app_secret('supabase_url') || '/functions/v1/cron-webhook?task=full-pipeline&secret=[HIDDEN]')::text as current_webhook_url,
    CASE 
      WHEN cj.active THEN 'Active'
      ELSE 'Inactive'
    END as cron_status,
    cs.last_run_at as last_execution,
    cs.next_run_at as next_execution,
    'Full Pipeline (fetch → content → generate → send)'::text as pipeline_type
  FROM cron.job cj
  LEFT JOIN cron_schedule cs ON cj.jobname = cs.task_name
  WHERE cj.jobname = 'full-pipeline-nightly';
END;
$$ LANGUAGE plpgsql;

-- Create a function to view pipeline execution history
CREATE OR REPLACE FUNCTION get_pipeline_history(limit_count integer DEFAULT 10)
RETURNS table(
  execution_time timestamp with time zone,
  status text,
  message text,
  pipeline_steps jsonb,
  duration_minutes numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pl.started_at as execution_time,
    pl.status,
    pl.message,
    pl.metadata->'steps' as pipeline_steps,
    EXTRACT(EPOCH FROM (COALESCE(pl.completed_at, NOW()) - pl.started_at)) / 60 as duration_minutes
  FROM processing_logs pl
  WHERE pl.process_type IN ('cron_full_pipeline', 'cron_trigger')
  ORDER BY pl.started_at DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION trigger_full_pipeline() TO postgres;
GRANT EXECUTE ON FUNCTION test_full_pipeline_cron() TO postgres, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_pipeline_history(integer) TO postgres, anon, authenticated;
GRANT EXECUTE ON FUNCTION show_webhook_config() TO postgres, anon, authenticated;

-- Clean up old schedule entry if it exists
DELETE FROM cron_schedule WHERE task_name = 'fetch-mail-threads-nightly';
