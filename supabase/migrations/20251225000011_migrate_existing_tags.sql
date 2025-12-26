-- Migrate existing tag data from patches.tags TEXT[] to patch_tags junction table
-- This script processes existing patches that have tags stored in the old TEXT[] format
-- and creates corresponding entries in the new patch_tags junction table

DO $$
DECLARE
  patch_record RECORD;
  tag_name TEXT;
  tag_id INTEGER;
  migrated_count INTEGER := 0;
  skipped_count INTEGER := 0;
  error_count INTEGER := 0;
BEGIN
  -- Loop through all patches that have tags in the old TEXT[] column
  FOR patch_record IN 
    SELECT patch_id, tags
    FROM commitfest.patches
    WHERE tags IS NOT NULL 
      AND array_length(tags, 1) > 0
  LOOP
    -- Process each tag in the array
    FOREACH tag_name IN ARRAY patch_record.tags
    LOOP
      BEGIN
        -- Look up tag ID by name
        SELECT id INTO tag_id
        FROM commitfest.tags
        WHERE name = tag_name;
        
        -- If tag found, create junction table entry
        IF tag_id IS NOT NULL THEN
          INSERT INTO commitfest.patch_tags (patch_id, tag_id, created_at)
          VALUES (patch_record.patch_id, tag_id, NOW())
          ON CONFLICT (patch_id, tag_id) DO NOTHING;
          
          migrated_count := migrated_count + 1;
        ELSE
          -- Tag not found in reference table - log warning but continue
          RAISE WARNING 'Tag "%" not found in commitfest.tags reference table for patch_id %', tag_name, patch_record.patch_id;
          skipped_count := skipped_count + 1;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        -- Log error but continue with next tag
        RAISE WARNING 'Error migrating tag "%" for patch_id %: %', tag_name, patch_record.patch_id, SQLERRM;
        error_count := error_count + 1;
      END;
    END LOOP;
  END LOOP;
  
  -- Log summary
  RAISE NOTICE 'Migration complete: % tags migrated, % tags skipped (not in reference table), % errors', 
    migrated_count, skipped_count, error_count;
END;
$$;

-- Add comment
COMMENT ON FUNCTION commitfest_link_patch_tags(INTEGER, INTEGER[]) IS 
  'This migration script migrates existing tag data from patches.tags TEXT[] to patch_tags junction table. Run this after populating the tags reference table.';

