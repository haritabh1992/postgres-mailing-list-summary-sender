-- Fix RLS policy for subscriber inserts
-- The previous policy was too restrictive and prevented inserts

DROP POLICY IF EXISTS "Allow public subscription" ON subscribers;

-- Allow public to insert new subscriptions (we'll set confirmation_status in application)
CREATE POLICY "Allow public subscription" ON subscribers
  FOR INSERT WITH CHECK (true);
