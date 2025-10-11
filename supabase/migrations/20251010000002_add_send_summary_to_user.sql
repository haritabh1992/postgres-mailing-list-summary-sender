-- Create a simple SQL function that passes email list to the edge function
-- All logic is handled in the edge function (verification, sending, delays, logging)

CREATE OR REPLACE FUNCTION public.send_latest_summary_to_users(user_emails TEXT[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  function_url TEXT;
  anon_key TEXT;
  request_id BIGINT;
  http_response RECORD;
BEGIN
  -- Validate input
  IF user_emails IS NULL OR array_length(user_emails, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Email list is required and cannot be empty'
    );
  END IF;

  -- Get the Edge Function URL and credentials
  BEGIN
    function_url := get_app_secret('supabase_url') || '/functions/v1/send-summary-to-user';
    anon_key := get_app_secret('supabase_anon_key');
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Failed to retrieve configuration: ' || SQLERRM
    );
  END;

  -- Call the Edge Function with the email list
  -- The edge function handles all logic: verification, sending, delays, logging
  BEGIN
    SELECT net.http_post(
      url := function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || anon_key
      ),
      body := jsonb_build_object('emails', user_emails)
    ) INTO request_id;

    IF request_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', true,
        'message', 'Email batch processing initiated',
        'request_id', request_id,
        'note', 'Check processing_logs table for detailed results'
      );
    ELSE
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Failed to initiate email batch processing'
      );
    END IF;

  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Exception: ' || SQLERRM
    );
  END;
END;
$$;

-- Add comment
COMMENT ON FUNCTION public.send_latest_summary_to_users(TEXT[]) IS 
'Simple pass-through function that sends an array of email addresses to the edge function.
All processing logic (verification, sending, delays, logging) is handled by the edge function.
Returns immediately with a request_id. Check processing_logs table for detailed results.';

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.send_latest_summary_to_users(TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_latest_summary_to_users(TEXT[]) TO service_role;
