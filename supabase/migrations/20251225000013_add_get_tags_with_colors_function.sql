-- Create function to get commitfest tags with colors for a normalized subject
-- Returns JSONB array with objects containing name and color for each tag
CREATE OR REPLACE FUNCTION get_commitfest_tags_with_colors_for_subject(p_subject_normalized TEXT)
RETURNS JSONB AS $$
DECLARE
  v_tags JSONB;
BEGIN
  -- Query to get all unique tags with their colors from patches associated with mail threads matching the normalized subject
  -- Join: mail_threads → patch_mail_threads → patches → patch_tags → tags
  SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object('name', t.name, 'color', t.color)), '[]'::jsonb) INTO v_tags
  FROM commitfest.mail_threads mt
  JOIN commitfest.patch_mail_threads pmt ON mt.id = pmt.mail_thread_id
  JOIN commitfest.patches p ON pmt.patch_id = p.patch_id
  JOIN commitfest.patch_tags pt ON p.patch_id = pt.patch_id
  JOIN commitfest.tags t ON pt.tag_id = t.id
  WHERE mt.subject_normalized = p_subject_normalized;
  
  RETURN COALESCE(v_tags, '[]'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_commitfest_tags_with_colors_for_subject(TEXT) TO anon, authenticated, service_role;

-- Add comment
COMMENT ON FUNCTION get_commitfest_tags_with_colors_for_subject(TEXT) IS 
  'Returns JSONB array of commitfest tag objects (with name and color) for mail threads matching the normalized subject. Used by summary generation to display tags with their colors.';

