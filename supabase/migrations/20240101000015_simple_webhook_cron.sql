-- Create a simpler approach using the webhook URL
-- This avoids exposing service keys in the database

-- Update the trigger function to call the webhook instead of direct Edge Function
CREATE OR REPLACE FUNCTION trigger_fetch_mail_threads()
RETURNS void AS $$
DECLARE
  request_id bigint;
  webhook_url text;
  cron_secret text;
BEGIN
  -- Set the webhook URL (update this with your actual project URL)
  webhook_url := get_app_secret('supabase_url') || '/functions/v1/cron-webhook';
  cron_secret := get_app_secret('cron_webhook_secret');
  
  -- Log the start of the cron job
  INSERT INTO processing_logs (process_type, status, message, metadata, started_at)
  VALUES ('cron_trigger', 'in_progress', 'Starting cron job to call fetch-mail-threads via webhook', 
          jsonb_build_object(
            'triggered_at', NOW(),
            'task_type', 'fetch_mail_threads',
            'schedule', 'nightly_midnight',
            'method', 'webhook_call'
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

  -- Make HTTP call to the webhook
  BEGIN
    -- Construct the full webhook URL with parameters
    webhook_url := webhook_url || '?task=fetch-mail-threads&secret=' || cron_secret;
    
    -- Make async HTTP GET request to the webhook
    SELECT net.http_get(
      url := webhook_url,
      headers := jsonb_build_object(
        'User-Agent', 'PostgreSQL-Cron/1.0'
      )
    ) INTO request_id;

    -- Log successful request initiation
    INSERT INTO processing_logs (process_type, status, message, metadata, completed_at)
    VALUES ('cron_trigger', 'success', 'HTTP webhook request sent to fetch-mail-threads', 
            jsonb_build_object(
              'request_id', request_id,
              'webhook_url', webhook_url,
              'method', 'http_get'
            ), NOW());

  EXCEPTION WHEN OTHERS THEN
    -- Log any errors in HTTP call
    INSERT INTO processing_logs (process_type, status, message, metadata, completed_at)
    VALUES ('cron_trigger', 'error', 'Failed to call webhook: ' || SQLERRM, 
            jsonb_build_object(
              'error_detail', SQLSTATE,
              'webhook_url', webhook_url,
              'error_message', SQLERRM
            ), NOW());
  END;

END;
$$ LANGUAGE plpgsql;

-- Create a function to update the webhook configuration
CREATE OR REPLACE FUNCTION update_webhook_config(
  p_project_id text,
  p_secret text DEFAULT NULL
)
RETURNS text AS $$
DECLARE
  new_function_body text;
BEGIN
  -- This function allows updating the webhook URL and secret
  -- You would call this with your actual Supabase project ID
  
  new_function_body := format('
CREATE OR REPLACE FUNCTION trigger_fetch_mail_threads()
RETURNS void AS $func$
DECLARE
  request_id bigint;
  webhook_url text;
BEGIN
  webhook_url := ''https://%s.supabase.co/functions/v1/cron-webhook?task=fetch-mail-threads&secret=%s'';
  
  INSERT INTO processing_logs (process_type, status, message, metadata, started_at)
  VALUES (''cron_trigger'', ''in_progress'', ''Starting cron job to call fetch-mail-threads via webhook'', 
          jsonb_build_object(
            ''triggered_at'', NOW(),
            ''task_type'', ''fetch_mail_threads'',
            ''schedule'', ''nightly_midnight'',
            ''method'', ''webhook_call''
          ), NOW());

  INSERT INTO cron_schedule (task_name, schedule_expression, last_run_at, next_run_at)
  VALUES (
    ''fetch-mail-threads-nightly'',
    ''0 0 * * *'',
    NOW(),
    NOW() + INTERVAL ''1 day''
  )
  ON CONFLICT (task_name) DO UPDATE SET
    last_run_at = NOW(),
    next_run_at = NOW() + INTERVAL ''1 day'',
    updated_at = NOW()
  WHERE cron_schedule.task_name = ''fetch-mail-threads-nightly'';

  BEGIN
    SELECT net.http_get(
      url := webhook_url,
      headers := jsonb_build_object(
        ''User-Agent'', ''PostgreSQL-Cron/1.0''
      )
    ) INTO request_id;

    INSERT INTO processing_logs (process_type, status, message, metadata, completed_at)
    VALUES (''cron_trigger'', ''success'', ''HTTP webhook request sent to fetch-mail-threads'', 
            jsonb_build_object(
              ''request_id'', request_id,
              ''webhook_url'', webhook_url,
              ''method'', ''http_get''
            ), NOW());

  EXCEPTION WHEN OTHERS THEN
    INSERT INTO processing_logs (process_type, status, message, metadata, completed_at)
    VALUES (''cron_trigger'', ''error'', ''Failed to call webhook: '' || SQLERRM, 
            jsonb_build_object(
              ''error_detail'', SQLSTATE,
              ''webhook_url'', webhook_url,
              ''error_message'', SQLERRM
            ), NOW());
  END;
END;
$func$ LANGUAGE plpgsql;
  ', p_project_id, p_secret);
  
  -- Execute the dynamic function creation
  EXECUTE new_function_body;
  
  RETURN 'Webhook configuration updated for project: ' || p_project_id;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION update_webhook_config(text, text) TO postgres;

-- Show current webhook configuration
CREATE OR REPLACE FUNCTION show_webhook_config()
RETURNS table(
  current_webhook_url text,
  cron_status text,
  last_execution timestamp with time zone,
  next_execution timestamp with time zone
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (get_app_secret('supabase_url') || '/functions/v1/cron-webhook?task=fetch-mail-threads&secret=[HIDDEN]')::text as current_webhook_url,
    CASE 
      WHEN cj.active THEN 'Active'
      ELSE 'Inactive'
    END as cron_status,
    cs.last_run_at as last_execution,
    cs.next_run_at as next_execution
  FROM cron.job cj
  LEFT JOIN cron_schedule cs ON cj.jobname = cs.task_name
  WHERE cj.jobname = 'fetch-mail-threads-nightly';
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION show_webhook_config() TO postgres, anon, authenticated;
