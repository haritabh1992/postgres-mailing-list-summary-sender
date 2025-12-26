-- Drop the old tags TEXT[] column from commitfest.patches table
-- This migration should only be run after:
-- 1. Tags reference table is populated
-- 2. Junction table is created
-- 3. Existing data is migrated
-- 4. Sync function is updated to use new structure
-- 5. All helper functions are updated

ALTER TABLE commitfest.patches DROP COLUMN IF EXISTS tags;

-- Add comment to document the change
COMMENT ON TABLE commitfest.patches IS 'Stores patch metadata from commitfest. Tags are now stored via commitfest.patch_tags junction table referencing commitfest.tags.';

