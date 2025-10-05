-- Enable pg_net extension for HTTP calls from PostgreSQL
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Update the trigger function to actually call the Edge Function
CREATE OR REPLACE FUNCTION trigger_fetch_mail_threads()
RETURNS void AS $$
DECLARE
  request_id bigint;
  supabase_url text;
  service_key text;
  webhook_url text;
BEGIN
  -- Get configuration (you'll need to set these as database settings)
  supabase_url := current_setting('app.settings.supabase_url', true);
  service_key := current_setting('app.settings.service_role_key', true);
  
  -- Fallback to environment variables if settings are not configured
  IF supabase_url IS NULL OR supabase_url = '' THEN
    -- For now, we'll use a placeholder - you'll need to update this
    supabase_url := get_app_secret('supabase_url');
  END IF;
  
  -- Log the start of the cron job
  INSERT INTO processing_logs (process_type, status, message, metadata, started_at)
  VALUES ('cron_trigger', 'in_progress', 'Starting cron job to call fetch-mail-threads', 
          jsonb_build_object(
            'triggered_at', NOW(),
            'task_type', 'fetch_mail_threads',
            'schedule', 'nightly_midnight',
            'method', 'http_call'
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

  -- Make HTTP call to the Edge Function
  BEGIN
    webhook_url := supabase_url || '/functions/v1/fetch-mail-threads';
    
    -- Make async HTTP POST request to the Edge Function
    SELECT net.http_post(
      url := webhook_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || COALESCE(service_key, get_app_secret('supabase_service_role_key'))
      ),
      body := jsonb_build_object(
        'source', 'database_cron',
        'triggered_at', NOW(),
        'cron_job', 'fetch-mail-threads-nightly'
      )
    ) INTO request_id;

    -- Log successful request initiation
    INSERT INTO processing_logs (process_type, status, message, metadata, completed_at)
    VALUES ('cron_trigger', 'success', 'HTTP request sent to fetch-mail-threads Edge Function', 
            jsonb_build_object(
              'request_id', request_id,
              'webhook_url', webhook_url,
              'method', 'http_post'
            ), NOW());

  EXCEPTION WHEN OTHERS THEN
    -- Log any errors in HTTP call
    INSERT INTO processing_logs (process_type, status, message, metadata, completed_at)
    VALUES ('cron_trigger', 'error', 'Failed to call fetch-mail-threads: ' || SQLERRM, 
            jsonb_build_object(
              'error_detail', SQLSTATE,
              'webhook_url', webhook_url,
              'error_message', SQLERRM
            ), NOW());
  END;

END;
$$ LANGUAGE plpgsql;

-- Create a function to set the configuration
CREATE OR REPLACE FUNCTION set_cron_config(
  p_supabase_url text,
  p_service_key text
)
RETURNS text AS $$
BEGIN
  -- Set the configuration in the database
  PERFORM set_config('app.settings.supabase_url', p_supabase_url, false);
  PERFORM set_config('app.settings.service_role_key', p_service_key, false);
  
  RETURN 'Configuration set successfully. URL: ' || p_supabase_url || ', Key: [HIDDEN]';
END;
$$ LANGUAGE plpgsql;

-- Create a function to test the HTTP call manually
CREATE OR REPLACE FUNCTION test_http_cron_call()
RETURNS text AS $$
DECLARE
  result text;
BEGIN
  PERFORM trigger_fetch_mail_threads();
  
  -- Check the latest log entry
  SELECT message INTO result 
  FROM processing_logs 
  WHERE process_type = 'cron_trigger' 
  ORDER BY started_at DESC 
  LIMIT 1;
  
  RETURN 'HTTP cron call test executed. Latest result: ' || COALESCE(result, 'No logs found');
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION set_cron_config(text, text) TO postgres;
GRANT EXECUTE ON FUNCTION test_http_cron_call() TO postgres, anon, authenticated;

-- Create a view to monitor HTTP requests
CREATE OR REPLACE VIEW cron_http_status AS
SELECT 
  pl.started_at,
  pl.completed_at,
  pl.status,
  pl.message,
  pl.metadata->>'request_id' as request_id,
  pl.metadata->>'webhook_url' as webhook_url,
  pl.metadata->>'method' as method,
  pl.metadata->>'error_message' as error_message
FROM processing_logs pl
WHERE pl.process_type = 'cron_trigger'
ORDER BY pl.started_at DESC;

GRANT SELECT ON cron_http_status TO anon, authenticated;
