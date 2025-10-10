-- Create a function to trigger summary generation without sending emails
-- This allows generating summaries for review before sending

CREATE OR REPLACE FUNCTION public.trigger_generate_summary_only()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  request_id bigint;
  webhook_url text;
  cron_secret text;
BEGIN
  -- Set the webhook URL and secret for summary generation
  webhook_url := get_app_secret('supabase_url') || '/functions/v1/cron-webhook';
  cron_secret := get_app_secret('cron_webhook_secret');
  
  -- Log the start of the summary generation job
  INSERT INTO processing_logs (process_type, status, message, metadata, started_at)
  VALUES ('cron_generate_summary', 'in_progress', 'Starting summary generation (without sending)', 
          jsonb_build_object(
            'triggered_at', NOW(),
            'task_type', 'generate_summary_only',
            'method', 'webhook_call',
            'steps', jsonb_build_array('generate-summary')
          ), NOW());

  -- Update the schedule tracking for summary generation
  INSERT INTO cron_schedule (task_name, schedule_expression, last_run_at, next_run_at)
  VALUES (
    'generate-summary-only',
    'manual',
    NOW(),
    NULL
  )
  ON CONFLICT (task_name) DO UPDATE SET
    last_run_at = NOW(),
    updated_at = NOW()
  WHERE cron_schedule.task_name = 'generate-summary-only';

  -- Make HTTP call to the webhook for summary generation
  BEGIN
    -- Construct the webhook URL for summary generation only
    webhook_url := webhook_url || '?task=generate-summary&secret=' || cron_secret;
    
    -- Make async HTTP GET request to generate the summary
    SELECT net.http_get(
      url := webhook_url,
      headers := jsonb_build_object(
        'User-Agent', 'PostgreSQL-Cron-Pipeline/1.0',
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || get_app_secret('supabase_anon_key')
      )
    ) INTO request_id;

    -- Log successful summary generation request initiation
    INSERT INTO processing_logs (process_type, status, message, metadata, completed_at)
    VALUES ('cron_generate_summary', 'success', 'HTTP webhook request sent for summary generation', 
            jsonb_build_object(
              'request_id', request_id,
              'webhook_url', get_app_secret('supabase_url') || '/functions/v1/cron-webhook?task=generate-summary&secret=[HIDDEN]',
              'method', 'http_get',
              'pipeline_steps', jsonb_build_array('generate-summary')
            ), NOW());

  EXCEPTION WHEN OTHERS THEN
    -- Log any errors in HTTP call
    INSERT INTO processing_logs (process_type, status, message, metadata, completed_at)
    VALUES ('cron_generate_summary', 'error', 'Failed to call summary generation webhook: ' || SQLERRM, 
            jsonb_build_object(
              'error_detail', SQLSTATE,
              'webhook_url', get_app_secret('supabase_url') || '/functions/v1/cron-webhook?task=generate-summary&secret=[HIDDEN]',
              'error_message', SQLERRM
            ), NOW());
  END;

END;
$function$
;

