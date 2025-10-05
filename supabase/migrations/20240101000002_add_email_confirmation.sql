-- Add email confirmation fields to subscribers table
ALTER TABLE subscribers 
ADD COLUMN confirmation_status VARCHAR(20) DEFAULT 'pending_confirmation' CHECK (confirmation_status IN ('pending_confirmation', 'confirmed', 'unsubscribed')),
ADD COLUMN confirmation_token VARCHAR(255) UNIQUE,
ADD COLUMN confirmation_expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN confirmed_at TIMESTAMP WITH TIME ZONE;

-- Update existing subscribers to be confirmed (since they were already active)
UPDATE subscribers 
SET confirmation_status = 'confirmed', 
    confirmed_at = subscribed_at,
    is_active = true
WHERE is_active = true;

-- Change default for is_active to false since we now require confirmation
ALTER TABLE subscribers ALTER COLUMN is_active SET DEFAULT FALSE;

-- Create index for confirmation token lookups
CREATE INDEX idx_subscribers_confirmation_token ON subscribers(confirmation_token);
CREATE INDEX idx_subscribers_confirmation_status ON subscribers(confirmation_status);

-- Update RLS policies to handle confirmation status
DROP POLICY IF EXISTS "Allow public subscription" ON subscribers;
DROP POLICY IF EXISTS "Allow public read active subscribers" ON subscribers;
DROP POLICY IF EXISTS "Allow public unsubscribe" ON subscribers;

-- Allow public to insert new subscriptions (we'll set confirmation_status in application)
CREATE POLICY "Allow public subscription" ON subscribers
  FOR INSERT WITH CHECK (true);

-- Allow public to read confirmed subscribers only
CREATE POLICY "Allow public read confirmed subscribers" ON subscribers
  FOR SELECT USING (confirmation_status = 'confirmed' AND is_active = true);

-- Allow public to update subscription status (for confirmation and unsubscribe)
CREATE POLICY "Allow public update subscription" ON subscribers
  FOR UPDATE USING (true);

-- Create function to generate confirmation token
CREATE OR REPLACE FUNCTION generate_confirmation_token()
RETURNS TEXT AS $$
BEGIN
  RETURN encode(gen_random_bytes(32), 'hex');
END;
$$ LANGUAGE plpgsql;

-- Create function to confirm subscription
CREATE OR REPLACE FUNCTION confirm_subscription(token_value TEXT)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  email TEXT
) AS $$
DECLARE
  subscriber_record RECORD;
BEGIN
  -- Find subscriber with valid token
  SELECT * INTO subscriber_record
  FROM subscribers
  WHERE confirmation_token = token_value
    AND confirmation_status = 'pending_confirmation'
    AND confirmation_expires_at > NOW();
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Invalid or expired confirmation token', NULL::TEXT;
    RETURN;
  END IF;
  
  -- Update subscriber to confirmed
  UPDATE subscribers
  SET confirmation_status = 'confirmed',
      is_active = true,
      confirmed_at = NOW(),
      confirmation_token = NULL,
      confirmation_expires_at = NULL
  WHERE id = subscriber_record.id;
  
  RETURN QUERY SELECT TRUE, 'Subscription confirmed successfully', subscriber_record.email;
END;
$$ LANGUAGE plpgsql;

-- Create function to clean up expired confirmation tokens
CREATE OR REPLACE FUNCTION cleanup_expired_confirmations()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM subscribers
  WHERE confirmation_status = 'pending_confirmation'
    AND confirmation_expires_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
