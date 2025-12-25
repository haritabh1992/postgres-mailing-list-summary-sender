-- Create RPC function to get commitfest tags for a normalized subject
-- This function performs the join across commitfest tables to find matching tags

CREATE OR REPLACE FUNCTION get_commitfest_tags_for_subject(p_subject_normalized TEXT)
RETURNS TEXT[] AS $$
DECLARE
  v_tags TEXT[];
BEGIN
  -- Query to get all unique tags from patches associated with mail threads matching the normalized subject
  SELECT ARRAY_AGG(DISTINCT tag) INTO v_tags
  FROM (
    SELECT unnest(p.tags) as tag
    FROM commitfest.mail_threads mt
    JOIN commitfest.patch_mail_threads pmt ON mt.id = pmt.mail_thread_id
    JOIN commitfest.patches p ON pmt.patch_id = p.patch_id
    WHERE mt.subject_normalized = p_subject_normalized
      AND p.tags IS NOT NULL
      AND array_length(p.tags, 1) > 0
  ) tag_list
  WHERE tag IS NOT NULL AND trim(tag) != '';
  
  -- Return empty array if no tags found
  RETURN COALESCE(v_tags, ARRAY[]::TEXT[]);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_commitfest_tags_for_subject(TEXT) TO anon, authenticated, service_role;

-- Add comment
COMMENT ON FUNCTION get_commitfest_tags_for_subject(TEXT) IS 
  'Returns array of unique commitfest tags for mail threads matching the normalized subject. Used by summary generation to include commitfest tags.';

