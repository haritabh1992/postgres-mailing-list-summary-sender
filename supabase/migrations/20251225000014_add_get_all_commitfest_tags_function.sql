-- Create function to get all commitfest tag names
-- Returns TEXT[] array of all tag names, sorted alphabetically
-- Used by summary generation to provide available tags to AI

CREATE OR REPLACE FUNCTION get_all_commitfest_tags()
RETURNS TEXT[] AS $$
DECLARE
  v_tags TEXT[];
BEGIN
  SELECT ARRAY_AGG(name ORDER BY name) INTO v_tags
  FROM commitfest.tags;
  
  RETURN COALESCE(v_tags, ARRAY[]::TEXT[]);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_all_commitfest_tags() TO anon, authenticated, service_role;

-- Add comment
COMMENT ON FUNCTION get_all_commitfest_tags() IS 
  'Returns array of all commitfest tag names, sorted alphabetically. Used by summary generation to provide available tags to AI for tag selection.';

