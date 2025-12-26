-- Create commitfest.tags reference table
-- This table stores tag definitions from the PostgreSQL commitfest JSON data
-- Tags are referenced by patches via the patch_tags junction table

CREATE TABLE commitfest.tags (
  id INTEGER PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  color VARCHAR(7), -- hex color code
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on name for lookups
CREATE INDEX idx_commitfest_tags_name ON commitfest.tags(name);

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_commitfest_tags_updated_at BEFORE UPDATE ON commitfest.tags
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create RPC function to upsert tag
CREATE OR REPLACE FUNCTION commitfest_upsert_tag(
  p_id INTEGER,
  p_name VARCHAR(255),
  p_color VARCHAR(7) DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  INSERT INTO commitfest.tags (id, name, color, description, updated_at)
  VALUES (p_id, p_name, p_color, p_description, NOW())
  ON CONFLICT (name) DO UPDATE SET
    id = EXCLUDED.id,
    color = COALESCE(EXCLUDED.color, commitfest.tags.color),
    description = COALESCE(EXCLUDED.description, commitfest.tags.description),
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create SQL wrapper function to refresh tags from JSON via Edge Function
CREATE OR REPLACE FUNCTION refresh_commitfest_tags()
RETURNS bigint AS $$
DECLARE
  request_id bigint;
  supabase_url text;
  anon_key text;
  webhook_url text;
BEGIN
  -- Get configuration from app_secrets
  supabase_url := get_app_secret('supabase_url');
  anon_key := get_app_secret('supabase_anon_key');
  
  -- Construct webhook URL
  webhook_url := supabase_url || '/functions/v1/sync-commitfest-tags';
  
  -- Make async HTTP POST request to the Edge Function
  SELECT net.http_post(
    url := webhook_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(anon_key, '')
    ),
    body := jsonb_build_object(
      'source', 'database_function',
      'triggered_at', NOW()
    )
  ) INTO request_id;

  RETURN request_id;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'Failed to call sync-commitfest-tags: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT SELECT ON commitfest.tags TO anon, authenticated;
GRANT EXECUTE ON FUNCTION commitfest_upsert_tag TO postgres, anon, authenticated;
GRANT EXECUTE ON FUNCTION refresh_commitfest_tags TO postgres, anon, authenticated;

-- Add comments
COMMENT ON TABLE commitfest.tags IS 'Reference table for commitfest tags with metadata (name, color, description)';
COMMENT ON FUNCTION commitfest_upsert_tag(INTEGER, VARCHAR, VARCHAR, TEXT) IS 'Upserts a tag into the commitfest.tags reference table';
COMMENT ON FUNCTION refresh_commitfest_tags() IS 'Calls the sync-commitfest-tags Edge Function to refresh tags from JSON. Returns the HTTP request ID.';

