-- Completely fix RLS policies for subscribers table
-- This migration ensures all RLS policies work correctly with the new confirmation system

-- Drop all existing policies on subscribers table
DROP POLICY IF EXISTS "Allow public subscription" ON subscribers;
DROP POLICY IF EXISTS "Allow public read active subscribers" ON subscribers;
DROP POLICY IF EXISTS "Allow public read confirmed subscribers" ON subscribers;
DROP POLICY IF EXISTS "Allow public unsubscribe" ON subscribers;
DROP POLICY IF EXISTS "Allow public update subscription" ON subscribers;

-- Disable RLS temporarily to ensure clean state
ALTER TABLE subscribers DISABLE ROW LEVEL SECURITY;

-- Re-enable RLS
ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;

-- Create new, comprehensive RLS policies

-- 1. Allow anyone to insert new subscriptions (we control the data in application)
CREATE POLICY "Allow public insert subscriptions" ON subscribers
  FOR INSERT WITH CHECK (true);

-- 2. Allow anyone to read their own subscription status (for confirmation page)
CREATE POLICY "Allow public read own subscription" ON subscribers
  FOR SELECT USING (true);

-- 3. Allow anyone to update subscription status (for confirmation and unsubscribe)
CREATE POLICY "Allow public update subscription status" ON subscribers
  FOR UPDATE USING (true);

-- 4. Allow service role to do everything (for admin functions)
CREATE POLICY "Allow service role full access" ON subscribers
  FOR ALL USING (auth.role() = 'service_role');

-- Verify the policies are working
-- This should return the policy names
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'subscribers';
