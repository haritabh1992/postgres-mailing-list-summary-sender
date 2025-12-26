-- Replace hourly-data-fetch with two separate cron jobs
-- This eliminates the need for cron-webhook and trigger_hourly_data_fetch function
-- fetch-mail-threads runs hourly, fetch-thread-content runs every 10 minutes

-- Unschedule the old hourly-data-fetch cron job
SELECT cron.unschedule('hourly-data-fetch');

-- Schedule fetch-mail-threads to run hourly
SELECT cron.schedule(
  'fetch-mail-threads-hourly',
  '0 * * * *',  -- Every hour at minute 0
  'SELECT trigger_fetch_mail_threads();'
);

-- Schedule fetch-thread-content to run every 10 minutes
SELECT cron.schedule(
  'fetch-thread-content-every-10-min',
  '*/10 * * * *',  -- Every 10 minutes
  'SELECT trigger_fetch_thread_content();'
);

-- Drop the old function that's no longer needed
DROP FUNCTION IF EXISTS public.trigger_hourly_data_fetch();

-- Update trigger_fetch_thread_content to track 10-minute schedule
CREATE OR REPLACE FUNCTION public.trigger_fetch_thread_content()
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  request_id bigint;
  supabase_url text;
  anon_key text;
  function_url text;
BEGIN
  -- Get configuration from app_secrets
  supabase_url := get_app_secret('supabase_url');
  anon_key := get_app_secret('supabase_anon_key');
  
  -- Log the start of the cron job
  INSERT INTO processing_logs (process_type, status, message, metadata, started_at)
  VALUES ('cron_trigger', 'in_progress', 'Starting cron job to call fetch-thread-content', 
          jsonb_build_object(
            'triggered_at', NOW(),
            'task_type', 'fetch_thread_content',
            'schedule', 'every_10_minutes',
            'method', 'http_post'
          ), NOW());

  -- Update the schedule tracking for 10-minute schedule
  INSERT INTO cron_schedule (task_name, schedule_expression, last_run_at, next_run_at)
  VALUES (
    'fetch-thread-content-every-10-min',
    '*/10 * * * *',
    NOW(),
    NOW() + INTERVAL '10 minutes'
  )
  ON CONFLICT (task_name) DO UPDATE SET
    last_run_at = NOW(),
    next_run_at = NOW() + INTERVAL '10 minutes',
    updated_at = NOW()
  WHERE cron_schedule.task_name = 'fetch-thread-content-every-10-min';

  -- Make HTTP call to the Edge Function
  BEGIN
    function_url := supabase_url || '/functions/v1/fetch-thread-content';
    
    -- Make async HTTP POST request to the Edge Function
    SELECT net.http_post(
      url := function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || COALESCE(anon_key, '')
      ),
      body := jsonb_build_object(
        'source', 'database_cron',
        'triggered_at', NOW(),
        'cron_job', 'fetch-thread-content-every-10-min'
      )
    ) INTO request_id;

    -- Log successful request initiation
    INSERT INTO processing_logs (process_type, status, message, metadata, completed_at)
    VALUES ('cron_trigger', 'success', 'HTTP request sent to fetch-thread-content Edge Function', 
            jsonb_build_object(
              'request_id', request_id,
              'function_url', function_url,
              'method', 'http_post'
            ), NOW());

  EXCEPTION WHEN OTHERS THEN
    -- Log any errors in HTTP call
    INSERT INTO processing_logs (process_type, status, message, metadata, completed_at)
    VALUES ('cron_trigger', 'error', 'Failed to call fetch-thread-content: ' || SQLERRM, 
            jsonb_build_object(
              'error_detail', SQLSTATE,
              'function_url', function_url,
              'error_message', SQLERRM
            ), NOW());
  END;

END;
$function$
;

-- Update comment to reflect 10-minute schedule
COMMENT ON FUNCTION public.trigger_fetch_thread_content() IS 
  'Triggers thread content fetching. Calls the fetch-thread-content edge function directly to process unprocessed mail threads in batches. Runs every 10 minutes to handle backlogs and failures more quickly. The edge function fetches content from thread URLs and stores it in the mail_thread_content table.';

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.trigger_fetch_thread_content() TO postgres, anon, authenticated;

