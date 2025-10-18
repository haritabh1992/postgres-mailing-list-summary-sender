-- Create a new function to trigger summary generation for a specific week end date
-- This allows generating summaries for custom date ranges
-- The function calculates the week start as the last Friday before the provided week_end_date

CREATE OR REPLACE FUNCTION public.trigger_generate_summary_for_date(week_end_date DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  request_id bigint;
  webhook_url text;
  cron_secret text;
  week_start_date DATE;
  day_of_week INTEGER;
BEGIN
  -- Calculate the last Friday before the week_end_date
  -- 0 = Sunday, 1 = Monday, ..., 5 = Friday, 6 = Saturday
  day_of_week := EXTRACT(DOW FROM week_end_date);
  
  -- Calculate days to subtract to get to last Friday
  IF day_of_week = 5 THEN
    -- If week_end_date is Friday, go back 7 days to last Friday
    week_start_date := week_end_date - INTERVAL '7 days';
  ELSIF day_of_week = 6 THEN
    -- If Saturday, go back 1 day to Friday
    week_start_date := week_end_date - INTERVAL '1 day';
  ELSE
    -- Sunday (0) through Thursday (4): calculate days back to previous Friday
    week_start_date := week_end_date - INTERVAL '1 day' * (day_of_week + 2);
  END IF;
  
  -- Set the webhook URL and secret for summary generation
  webhook_url := get_app_secret('supabase_url') || '/functions/v1/generate-summary';
  cron_secret := get_app_secret('supabase_anon_key');
  
  -- Log the start of the summary generation job
  INSERT INTO processing_logs (process_type, status, message, metadata, started_at)
  VALUES ('summary_generation', 'in_progress', 'Starting summary generation for custom date range', 
          jsonb_build_object(
            'triggered_at', NOW(),
            'week_start_date', week_start_date,
            'week_end_date', week_end_date,
            'task_type', 'generate_summary_custom_date',
            'method', 'http_post'
          ), NOW());

  -- Make HTTP call to the edge function with custom dates
  BEGIN
    -- Make HTTP POST request to generate the summary with custom dates
    SELECT net.http_post(
      url := webhook_url,
      headers := jsonb_build_object(
        'User-Agent', 'PostgreSQL-Function/1.0',
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || cron_secret
      ),
      body := jsonb_build_object(
        'weekStart', week_start_date::text,
        'weekEnd', week_end_date::text
      )
    ) INTO request_id;

    -- Log successful summary generation request initiation
    INSERT INTO processing_logs (process_type, status, message, metadata, completed_at)
    VALUES ('summary_generation', 'success', 'HTTP request sent for summary generation', 
            jsonb_build_object(
              'request_id', request_id,
              'week_start_date', week_start_date,
              'week_end_date', week_end_date,
              'method', 'http_post'
            ), NOW());

    RETURN jsonb_build_object(
      'success', true,
      'message', 'Summary generation initiated',
      'request_id', request_id,
      'week_start_date', week_start_date,
      'week_end_date', week_end_date
    );

  EXCEPTION WHEN OTHERS THEN
    -- Log any errors in HTTP call
    INSERT INTO processing_logs (process_type, status, message, metadata, completed_at)
    VALUES ('summary_generation', 'error', 'Failed to call summary generation: ' || SQLERRM, 
            jsonb_build_object(
              'error_detail', SQLSTATE,
              'error_message', SQLERRM,
              'week_start_date', week_start_date,
              'week_end_date', week_end_date
            ), NOW());
    
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
  END;

END;
$function$;

-- Add comment
COMMENT ON FUNCTION public.trigger_generate_summary_for_date(DATE) IS 
'Triggers summary generation for a specific week ending on the provided date.
Automatically calculates the week start as the last Friday before the week_end_date.
Example: SELECT trigger_generate_summary_for_date(''2024-10-17'');';

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.trigger_generate_summary_for_date(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_generate_summary_for_date(DATE) TO service_role;

