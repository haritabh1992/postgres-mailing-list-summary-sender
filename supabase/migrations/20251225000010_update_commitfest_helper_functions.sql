-- Update commitfest helper functions to work with the new tags reference table structure

-- Create function to link patch to tags via junction table
CREATE OR REPLACE FUNCTION commitfest_link_patch_tags(
  p_patch_id INTEGER,
  p_tag_ids INTEGER[]
)
RETURNS void AS $$
BEGIN
  -- Delete existing tag associations for the patch
  DELETE FROM commitfest.patch_tags WHERE patch_id = p_patch_id;
  
  -- Insert new associations from tag_ids array
  IF array_length(p_tag_ids, 1) > 0 THEN
    INSERT INTO commitfest.patch_tags (patch_id, tag_id, created_at)
    SELECT p_patch_id, unnest(p_tag_ids), NOW()
    ON CONFLICT (patch_id, tag_id) DO NOTHING;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update commitfest_upsert_patch function to remove p_tags parameter
-- Tags will be handled separately via commitfest_link_patch_tags
CREATE OR REPLACE FUNCTION commitfest_upsert_patch(
  p_patch_id INTEGER,
  p_patch_url VARCHAR(500),
  p_title TEXT,
  p_status VARCHAR(100),
  p_author VARCHAR(255),
  p_created_at TIMESTAMP WITH TIME ZONE,
  p_last_modified TIMESTAMP WITH TIME ZONE
)
RETURNS void AS $$
BEGIN
  INSERT INTO commitfest.patches (
    patch_id, patch_url, title, status, author, 
    created_at, last_modified, last_synced_at, updated_at
  )
  VALUES (
    p_patch_id, p_patch_url, p_title, p_status, p_author,
    p_created_at, p_last_modified, NOW(), NOW()
  )
  ON CONFLICT (patch_id) DO UPDATE SET
    patch_url = EXCLUDED.patch_url,
    title = EXCLUDED.title,
    status = EXCLUDED.status,
    author = EXCLUDED.author,
    created_at = EXCLUDED.created_at,
    last_modified = EXCLUDED.last_modified,
    last_synced_at = NOW(),
    updated_at = NOW();
    -- Note: tags column is NOT updated here - it's handled separately via commitfest_link_patch_tags
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update get_commitfest_tags_for_subject function to query tags via new junction table
CREATE OR REPLACE FUNCTION get_commitfest_tags_for_subject(p_subject_normalized TEXT)
RETURNS TEXT[] AS $$
DECLARE
  v_tags TEXT[];
BEGIN
  -- Query to get all unique tag names from patches associated with mail threads matching the normalized subject
  -- Join: mail_threads → patch_mail_threads → patches → patch_tags → tags
  SELECT ARRAY_AGG(DISTINCT t.name) INTO v_tags
  FROM commitfest.mail_threads mt
  JOIN commitfest.patch_mail_threads pmt ON mt.id = pmt.mail_thread_id
  JOIN commitfest.patches p ON pmt.patch_id = p.patch_id
  JOIN commitfest.patch_tags pt ON p.patch_id = pt.patch_id
  JOIN commitfest.tags t ON pt.tag_id = t.id
  WHERE mt.subject_normalized = p_subject_normalized;
  
  -- Return empty array if no tags found
  RETURN COALESCE(v_tags, ARRAY[]::TEXT[]);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create helper function to get tag ID by name
CREATE OR REPLACE FUNCTION commitfest_get_tag_id_by_name(p_tag_name VARCHAR(255))
RETURNS INTEGER AS $$
DECLARE
  v_tag_id INTEGER;
BEGIN
  SELECT id INTO v_tag_id
  FROM commitfest.tags
  WHERE name = p_tag_name;
  
  RETURN v_tag_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION commitfest_link_patch_tags TO postgres, anon, authenticated;
GRANT EXECUTE ON FUNCTION commitfest_get_tag_id_by_name TO postgres, anon, authenticated;

-- Add comments
COMMENT ON FUNCTION commitfest_link_patch_tags(INTEGER, INTEGER[]) IS 
  'Links a patch to tags via the patch_tags junction table. Replaces existing tag associations.';
COMMENT ON FUNCTION get_commitfest_tags_for_subject(TEXT) IS 
  'Returns array of unique commitfest tag names for mail threads matching the normalized subject. Queries via the new patch_tags junction table structure.';

