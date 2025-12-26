-- Create trigger_fetch_thread_content function to call fetch-thread-content edge function directly
-- This function wraps the edge function call with logging and error handling
-- The edge function processes unprocessed mail threads in batches (default 100)

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
            'schedule', 'hourly',
            'method', 'http_post'
          ), NOW());

  -- Update the schedule tracking
  INSERT INTO cron_schedule (task_name, schedule_expression, last_run_at, next_run_at)
  VALUES (
    'fetch-thread-content-hourly',
    '0 * * * *',
    NOW(),
    NOW() + INTERVAL '1 hour'
  )
  ON CONFLICT (task_name) DO UPDATE SET
    last_run_at = NOW(),
    next_run_at = NOW() + INTERVAL '1 hour',
    updated_at = NOW()
  WHERE cron_schedule.task_name = 'fetch-thread-content-hourly';

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
        'cron_job', 'fetch-thread-content-hourly'
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

-- Add comment explaining the function
COMMENT ON FUNCTION public.trigger_fetch_thread_content() IS 
  'Triggers thread content fetching. Calls the fetch-thread-content edge function directly to process unprocessed mail threads in batches. The edge function fetches content from thread URLs and stores it in the mail_thread_content table.';

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.trigger_fetch_thread_content() TO postgres, anon, authenticated;

