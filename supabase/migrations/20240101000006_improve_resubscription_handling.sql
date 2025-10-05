-- Update the cleanup function to handle re-subscriptions better
-- Instead of deleting expired pending confirmations, just clear the tokens
CREATE OR REPLACE FUNCTION cleanup_expired_confirmations()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  -- Clear expired confirmation tokens but keep the subscriber record
  UPDATE subscribers
  SET confirmation_token = NULL,
      confirmation_expires_at = NULL,
      confirmation_status = CASE 
        WHEN confirmation_status = 'pending_confirmation' THEN 'unsubscribed'
        ELSE confirmation_status
      END
  WHERE confirmation_status = 'pending_confirmation'
    AND confirmation_expires_at < NOW();
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- Create a function to get subscription history stats (optional, for admin purposes)
CREATE OR REPLACE FUNCTION get_subscription_history_stats()
RETURNS TABLE (
  total_unique_emails BIGINT,
  currently_active BIGINT,
  total_unsubscribed BIGINT,
  pending_confirmation BIGINT,
  total_resubscriptions BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (SELECT COUNT(DISTINCT email) FROM subscribers) as total_unique_emails,
    (SELECT COUNT(*) FROM subscribers WHERE confirmation_status = 'confirmed' AND is_active = true) as currently_active,
    (SELECT COUNT(*) FROM subscribers WHERE confirmation_status = 'unsubscribed') as total_unsubscribed,
    (SELECT COUNT(*) FROM subscribers WHERE confirmation_status = 'pending_confirmation') as pending_confirmation,
    -- Count emails that have been subscribed more than once (resubscriptions)
    (SELECT COUNT(*) FROM (
      SELECT email, COUNT(*) as subscription_count
      FROM subscribers 
      GROUP BY email 
      HAVING COUNT(*) > 1
    ) resubscribers) as total_resubscriptions;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to anonymous users for the new stats function
GRANT EXECUTE ON FUNCTION get_subscription_history_stats() TO anon;
