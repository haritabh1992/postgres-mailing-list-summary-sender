-- Split the cron jobs into two separate functions:
-- 1. Hourly: Fetch mail threads and content
-- 2. Nightly: Generate summary and send emails

-- Function 1: Hourly data fetching (fetch threads + content)
CREATE OR REPLACE FUNCTION trigger_hourly_data_fetch()
RETURNS void AS $$
DECLARE
  request_id bigint;
  webhook_url text;
  cron_secret text;
BEGIN
  -- Set the webhook URL and secret
  webhook_url := get_app_secret('supabase_url') || '/functions/v1/cron-webhook';
  cron_secret := get_app_secret('cron_webhook_secret');
  
  -- Log the start of the hourly data fetch
  INSERT INTO processing_logs (process_type, status, message, metadata, started_at)
  VALUES ('cron_hourly_fetch', 'in_progress', 'Starting hourly data fetch: fetch threads + content', 
          jsonb_build_object(
            'triggered_at', NOW(),
            'task_type', 'hourly_fetch',
            'schedule', 'hourly',
            'method', 'webhook_call',
            'steps', jsonb_build_array('fetch-mail-threads', 'fetch-thread-content')
          ), NOW());

  -- Update the schedule tracking for hourly fetch
  INSERT INTO cron_schedule (task_name, schedule_expression, last_run_at, next_run_at)
  VALUES (
    'hourly-data-fetch',
    '0 * * * *',
    NOW(),
    NOW() + INTERVAL '1 hour'
  )
  ON CONFLICT (task_name) DO UPDATE SET
    last_run_at = NOW(),
    next_run_at = NOW() + INTERVAL '1 hour',
    updated_at = NOW()
  WHERE cron_schedule.task_name = 'hourly-data-fetch';

  -- Make HTTP call to the webhook for hourly fetch
  BEGIN
    -- Construct the webhook URL for hourly fetch
    webhook_url := webhook_url || '?task=hourly-fetch&secret=' || cron_secret;
    
    -- Make async HTTP GET request to run the hourly fetch
    SELECT net.http_get(
      url := webhook_url,
      headers := jsonb_build_object(
        'User-Agent', 'PostgreSQL-Cron-Pipeline/1.0',
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || get_app_secret('supabase_anon_key')
      ),
      timeout_milliseconds := 10000  -- 10 second timeout for lighter operation
    ) INTO request_id;

    -- Log successful hourly fetch request initiation
    INSERT INTO processing_logs (process_type, status, message, metadata, completed_at)
    VALUES ('cron_hourly_fetch', 'success', 'HTTP webhook request sent for hourly data fetch', 
            jsonb_build_object(
              'request_id', request_id,
              'webhook_url', get_app_secret('supabase_url') || '/functions/v1/cron-webhook?task=hourly-fetch&secret=[HIDDEN]',
              'method', 'http_get',
              'pipeline_steps', jsonb_build_array('fetch-mail-threads', 'fetch-thread-content')
            ), NOW());

  EXCEPTION WHEN OTHERS THEN
    -- Log any errors in HTTP call
    INSERT INTO processing_logs (process_type, status, message, metadata, completed_at)
    VALUES ('cron_hourly_fetch', 'error', 'Failed to call hourly fetch webhook: ' || SQLERRM, 
            jsonb_build_object(
              'error_detail', SQLSTATE,
              'webhook_url', get_app_secret('supabase_url') || '/functions/v1/cron-webhook?task=hourly-fetch&secret=[HIDDEN]',
              'error_message', SQLERRM
            ), NOW());
  END;

END;
$$ LANGUAGE plpgsql;

-- Function 2: Nightly summary generation and email sending
CREATE OR REPLACE FUNCTION trigger_nightly_summary_send()
RETURNS void AS $$
DECLARE
  request_id bigint;
  webhook_url text;
  cron_secret text;
BEGIN
  -- Set the webhook URL and secret
  webhook_url := get_app_secret('supabase_url') || '/functions/v1/cron-webhook';
  cron_secret := get_app_secret('cron_webhook_secret');
  
  -- Log the start of the nightly summary and send
  INSERT INTO processing_logs (process_type, status, message, metadata, started_at)
  VALUES ('cron_nightly_summary', 'in_progress', 'Starting nightly summary: generate + send', 
          jsonb_build_object(
            'triggered_at', NOW(),
            'task_type', 'nightly_summary',
            'schedule', 'nightly_midnight',
            'method', 'webhook_call',
            'steps', jsonb_build_array('generate-summary', 'send-summary')
          ), NOW());

  -- Update the schedule tracking for nightly summary
  INSERT INTO cron_schedule (task_name, schedule_expression, last_run_at, next_run_at)
  VALUES (
    'nightly-summary-send',
    '0 0 * * *',
    NOW(),
    NOW() + INTERVAL '1 day'
  )
  ON CONFLICT (task_name) DO UPDATE SET
    last_run_at = NOW(),
    next_run_at = NOW() + INTERVAL '1 day',
    updated_at = NOW()
  WHERE cron_schedule.task_name = 'nightly-summary-send';

  -- Make HTTP call to the webhook for nightly summary
  BEGIN
    -- Construct the webhook URL for nightly summary
    webhook_url := webhook_url || '?task=nightly-summary&secret=' || cron_secret;
    
    -- Make async HTTP GET request to run the nightly summary
    SELECT net.http_get(
      url := webhook_url,
      headers := jsonb_build_object(
        'User-Agent', 'PostgreSQL-Cron-Pipeline/1.0',
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || get_app_secret('supabase_anon_key')
      ),
      timeout_milliseconds := 15000  -- 15 second timeout for summary generation
    ) INTO request_id;

    -- Log successful nightly summary request initiation
    INSERT INTO processing_logs (process_type, status, message, metadata, completed_at)
    VALUES ('cron_nightly_summary', 'success', 'HTTP webhook request sent for nightly summary', 
            jsonb_build_object(
              'request_id', request_id,
              'webhook_url', get_app_secret('supabase_url') || '/functions/v1/cron-webhook?task=nightly-summary&secret=[HIDDEN]',
              'method', 'http_get',
              'pipeline_steps', jsonb_build_array('generate-summary', 'send-summary')
            ), NOW());

  EXCEPTION WHEN OTHERS THEN
    -- Log any errors in HTTP call
    INSERT INTO processing_logs (process_type, status, message, metadata, completed_at)
    VALUES ('cron_nightly_summary', 'error', 'Failed to call nightly summary webhook: ' || SQLERRM, 
            jsonb_build_object(
              'error_detail', SQLSTATE,
              'webhook_url', get_app_secret('supabase_url') || '/functions/v1/cron-webhook?task=nightly-summary&secret=[HIDDEN]',
              'error_message', SQLERRM
            ), NOW());
  END;

END;
$$ LANGUAGE plpgsql;

-- Remove the old full pipeline cron job
SELECT cron.unschedule('full-pipeline-nightly');

-- Schedule the new cron jobs
-- 1. Hourly data fetch (every hour at minute 0)
SELECT cron.schedule(
  'hourly-data-fetch',
  '0 * * * *',  -- Every hour at minute 0
  'SELECT trigger_hourly_data_fetch();'
);

-- 2. Nightly summary and send (every day at midnight UTC)
SELECT cron.schedule(
  'nightly-summary-send',
  '0 0 * * *',  -- Every day at midnight UTC
  'SELECT trigger_nightly_summary_send();'
);

-- Create test functions for both cron jobs
CREATE OR REPLACE FUNCTION test_hourly_cron()
RETURNS text AS $$
DECLARE
  result text;
BEGIN
  PERFORM trigger_hourly_data_fetch();
  
  -- Check the latest log entry
  SELECT message INTO result 
  FROM processing_logs 
  WHERE process_type = 'cron_hourly_fetch' 
  ORDER BY started_at DESC 
  LIMIT 1;
  
  RETURN 'Hourly cron test executed. Latest result: ' || COALESCE(result, 'No logs found');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION test_nightly_cron()
RETURNS text AS $$
DECLARE
  result text;
BEGIN
  PERFORM trigger_nightly_summary_send();
  
  -- Check the latest log entry
  SELECT message INTO result 
  FROM processing_logs 
  WHERE process_type = 'cron_nightly_summary' 
  ORDER BY started_at DESC 
  LIMIT 1;
  
  RETURN 'Nightly cron test executed. Latest result: ' || COALESCE(result, 'No logs found');
END;
$$ LANGUAGE plpgsql;

-- Create a function to show the new cron configuration
CREATE OR REPLACE FUNCTION show_split_cron_config()
RETURNS TABLE(
  job_name text,
  schedule text,
  description text,
  next_run timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    'hourly-data-fetch'::text as job_name,
    '0 * * * *'::text as schedule,
    'Fetch mail threads and content every hour'::text as description,
    NOW() + INTERVAL '1 hour' as next_run
  UNION ALL
  SELECT 
    'nightly-summary-send'::text as job_name,
    '0 0 * * *'::text as schedule,
    'Generate summary and send emails every night at midnight'::text as description,
    (DATE_TRUNC('day', NOW()) + INTERVAL '1 day')::timestamptz as next_run;
END;
$$ LANGUAGE plpgsql;
