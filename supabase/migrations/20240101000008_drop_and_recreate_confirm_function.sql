-- Drop the existing function and recreate it with proper return type
DROP FUNCTION IF EXISTS confirm_subscription(TEXT);

-- Create new function that returns JSON instead of TABLE
CREATE OR REPLACE FUNCTION confirm_subscription(token_value TEXT)
RETURNS JSON AS $$
DECLARE
  subscriber_record RECORD;
  result JSON;
BEGIN
  -- Find subscriber with valid token
  SELECT * INTO subscriber_record
  FROM subscribers
  WHERE confirmation_token = token_value
    AND confirmation_status = 'pending_confirmation'
    AND confirmation_expires_at > NOW();
  
  IF NOT FOUND THEN
    result := json_build_object(
      'success', false,
      'message', 'Invalid or expired confirmation token',
      'email', null
    );
    RETURN result;
  END IF;
  
  -- Update subscriber to confirmed
  UPDATE subscribers
  SET confirmation_status = 'confirmed',
      is_active = true,
      confirmed_at = NOW(),
      confirmation_token = NULL,
      confirmation_expires_at = NULL
  WHERE id = subscriber_record.id;
  
  result := json_build_object(
    'success', true,
    'message', 'Subscription confirmed successfully',
    'email', subscriber_record.email
  );
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;
