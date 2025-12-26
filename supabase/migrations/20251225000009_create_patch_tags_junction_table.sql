-- Create commitfest.patch_tags junction table
-- This table links patches to tags (many-to-many relationship)
-- Note: The old tags TEXT[] column in commitfest.patches is kept until migration is complete

CREATE TABLE commitfest.patch_tags (
  patch_id INTEGER NOT NULL REFERENCES commitfest.patches(patch_id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES commitfest.tags(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (patch_id, tag_id)
);

-- Create indexes for performance
CREATE INDEX idx_commitfest_patch_tags_patch_id ON commitfest.patch_tags(patch_id);
CREATE INDEX idx_commitfest_patch_tags_tag_id ON commitfest.patch_tags(tag_id);

-- Grant necessary permissions
GRANT SELECT ON commitfest.patch_tags TO anon, authenticated;

-- Add comment
COMMENT ON TABLE commitfest.patch_tags IS 'Junction table linking patches to tags in the commitfest schema';

