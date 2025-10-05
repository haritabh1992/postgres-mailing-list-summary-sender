-- SECURITY FIX: Remove hardcoded secrets and use environment-based configuration
-- This migration replaces hardcoded values with secure environment-based approach

-- Create a secure configuration table
CREATE TABLE IF NOT EXISTS app_secrets (
  key text PRIMARY KEY,
  value text NOT NULL,
  description text,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW()
);

-- Insert configuration placeholders (these will be set via environment variables)
INSERT INTO app_secrets (key, value, description) VALUES 
('supabase_url', 'https://your-project-id.supabase.co', 'Supabase project URL'),
('supabase_anon_key', 'your-anon-key-here', 'Supabase anonymous key'),
('cron_webhook_secret', 'your-cron-secret-here', 'Cron webhook authentication secret')
ON CONFLICT (key) DO UPDATE SET 
  value = EXCLUDED.value,
  updated_at = NOW();

-- Create secure functions to get configuration
CREATE OR REPLACE FUNCTION get_app_secret(secret_key text)
RETURNS text AS $$
DECLARE
  secret_value text;
BEGIN
  SELECT value INTO secret_value 
  FROM app_secrets 
  WHERE key = secret_key;
  
  IF secret_value IS NULL THEN
    RAISE EXCEPTION 'Secret key % not found in app_secrets table', secret_key;
  END IF;
  
  -- Check if it's still a placeholder
  IF secret_value LIKE 'your-%' OR secret_value LIKE 'https://your-%' THEN
    RAISE EXCEPTION 'Secret key % is still set to placeholder value. Please update it with actual value.', secret_key;
  END IF;
  
  RETURN secret_value;
END;
$$ LANGUAGE plpgsql;

-- Create function to update secrets securely
CREATE OR REPLACE FUNCTION set_app_secret(secret_key text, secret_value text, secret_description text DEFAULT NULL)
RETURNS text AS $$
BEGIN
  INSERT INTO app_secrets (key, value, description) 
  VALUES (secret_key, secret_value, secret_description)
  ON CONFLICT (key) DO UPDATE SET 
    value = EXCLUDED.value,
    description = COALESCE(EXCLUDED.description, app_secrets.description),
    updated_at = NOW();
  
  RETURN 'Secret updated successfully';
END;
$$ LANGUAGE plpgsql;

-- Update the trigger functions to use secure configuration
CREATE OR REPLACE FUNCTION trigger_hourly_data_fetch()
RETURNS void AS $$
DECLARE
  request_id bigint;
  webhook_url text;
  cron_secret text;
  anon_key text;
BEGIN
  -- Get configuration from secure storage
  webhook_url := get_app_secret('supabase_url') || '/functions/v1/cron-webhook';
  cron_secret := get_app_secret('cron_webhook_secret');
  anon_key := get_app_secret('supabase_anon_key');
  
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
        'Authorization', 'Bearer ' || anon_key
      ),
      timeout_milliseconds := 10000  -- 10 second timeout for lighter operation
    ) INTO request_id;

    -- Log successful hourly fetch request initiation
    INSERT INTO processing_logs (process_type, status, message, metadata, completed_at)
    VALUES ('cron_hourly_fetch', 'success', 'HTTP webhook request sent for hourly data fetch', 
            jsonb_build_object(
              'request_id', request_id,
              'webhook_url', '[HIDDEN]',
              'method', 'http_get',
              'pipeline_steps', jsonb_build_array('fetch-mail-threads', 'fetch-thread-content')
            ), NOW());

  EXCEPTION WHEN OTHERS THEN
    -- Log any errors in HTTP call
    INSERT INTO processing_logs (process_type, status, message, metadata, completed_at)
    VALUES ('cron_hourly_fetch', 'error', 'Failed to call hourly fetch webhook: ' || SQLERRM, 
            jsonb_build_object(
              'error_detail', SQLSTATE,
              'webhook_url', '[HIDDEN]',
              'error_message', SQLERRM
            ), NOW());
  END;

END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trigger_nightly_summary_send()
RETURNS void AS $$
DECLARE
  request_id bigint;
  webhook_url text;
  cron_secret text;
  anon_key text;
BEGIN
  -- Get configuration from secure storage
  webhook_url := get_app_secret('supabase_url') || '/functions/v1/cron-webhook';
  cron_secret := get_app_secret('cron_webhook_secret');
  anon_key := get_app_secret('supabase_anon_key');
  
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
        'Authorization', 'Bearer ' || anon_key
      ),
      timeout_milliseconds := 15000  -- 15 second timeout for summary generation
    ) INTO request_id;

    -- Log successful nightly summary request initiation
    INSERT INTO processing_logs (process_type, status, message, metadata, completed_at)
    VALUES ('cron_nightly_summary', 'success', 'HTTP webhook request sent for nightly summary', 
            jsonb_build_object(
              'request_id', request_id,
              'webhook_url', '[HIDDEN]',
              'method', 'http_get',
              'pipeline_steps', jsonb_build_array('generate-summary', 'send-summary')
            ), NOW());

  EXCEPTION WHEN OTHERS THEN
    -- Log any errors in HTTP call
    INSERT INTO processing_logs (process_type, status, message, metadata, completed_at)
    VALUES ('cron_nightly_summary', 'error', 'Failed to call nightly summary webhook: ' || SQLERRM, 
            jsonb_build_object(
              'error_detail', SQLSTATE,
              'webhook_url', '[HIDDEN]',
              'error_message', SQLERRM
            ), NOW());
  END;

END;
$$ LANGUAGE plpgsql;

-- Create a function to show current configuration (without revealing secrets)
CREATE OR REPLACE FUNCTION show_secure_config()
RETURNS TABLE(
  config_key text,
  has_value boolean,
  description text,
  last_updated timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.key as config_key,
    CASE 
      WHEN s.value LIKE 'your-%' OR s.value LIKE 'https://your-%' THEN false
      ELSE true 
    END as has_value,
    s.description,
    s.updated_at as last_updated
  FROM app_secrets s
  ORDER BY s.key;
END;
$$ LANGUAGE plpgsql;
