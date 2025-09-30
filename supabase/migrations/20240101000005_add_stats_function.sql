-- Create function to get public stats for the homepage
CREATE OR REPLACE FUNCTION get_public_stats()
RETURNS TABLE (
  total_subscribers BIGINT,
  total_summaries BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (SELECT COUNT(*) FROM subscribers WHERE confirmation_status = 'confirmed' AND is_active = true) as total_subscribers,
    (SELECT COUNT(*) FROM weekly_summaries) as total_summaries;
END;
$$ LANGUAGE plpgsql;

-- Create RLS policy to allow public access to stats function
CREATE POLICY "Allow public access to stats" ON subscribers
  FOR SELECT USING (false); -- This won't be used since we're using the function

-- Grant execute permission to anonymous users for the stats function
GRANT EXECUTE ON FUNCTION get_public_stats() TO anon;
