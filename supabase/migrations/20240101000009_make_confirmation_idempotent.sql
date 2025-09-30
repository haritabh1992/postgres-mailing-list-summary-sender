-- Make confirmation idempotent - allow clicking the same link multiple times
CREATE OR REPLACE FUNCTION confirm_subscription(token_value TEXT)
RETURNS JSON AS $$
DECLARE
  subscriber_record RECORD;
  result JSON;
BEGIN
  -- First, try to find subscriber with the token (pending confirmation)
  SELECT * INTO subscriber_record
  FROM subscribers
  WHERE confirmation_token = token_value
    AND confirmation_status = 'pending_confirmation'
    AND confirmation_expires_at > NOW();
  
  IF FOUND THEN
    -- Token is valid and pending - confirm the subscription
    UPDATE subscribers
    SET confirmation_status = 'confirmed',
        is_active = true,
        confirmed_at = NOW()
        -- Keep the token and expiry for idempotent behavior
    WHERE id = subscriber_record.id;
    
    result := json_build_object(
      'success', true,
      'message', 'Subscription confirmed successfully! Welcome to PostgreSQL Weekly Summary.',
      'email', subscriber_record.email
    );
    RETURN result;
  END IF;
  
  -- Check if this token belongs to an already confirmed subscription
  SELECT * INTO subscriber_record
  FROM subscribers
  WHERE confirmation_token = token_value
    AND confirmation_status = 'confirmed'
    AND is_active = true;
  
  IF FOUND THEN
    -- Already confirmed - return success message
    result := json_build_object(
      'success', true,
      'message', 'You are already subscribed to PostgreSQL Weekly Summary! No action needed.',
      'email', subscriber_record.email
    );
    RETURN result;
  END IF;
  
  -- Check if token exists but is expired
  SELECT * INTO subscriber_record
  FROM subscribers
  WHERE confirmation_token = token_value;
  
  IF FOUND THEN
    -- Token exists but expired
    result := json_build_object(
      'success', false,
      'message', 'This confirmation link has expired. Please subscribe again to receive a new confirmation email.',
      'email', null
    );
    RETURN result;
  END IF;
  
  -- Token not found at all
  result := json_build_object(
    'success', false,
    'message', 'Invalid confirmation link. This link may have been tampered with or is from an old subscription attempt.',
    'email', null
  );
  RETURN result;
END;
$$ LANGUAGE plpgsql;
