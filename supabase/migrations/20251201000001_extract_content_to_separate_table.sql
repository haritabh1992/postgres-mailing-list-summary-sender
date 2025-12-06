-- Extract content column from mail_threads to separate mail_thread_contents table
-- This improves schema normalization and allows for better content management

-- Create mail_thread_contents table
CREATE TABLE mail_thread_contents (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  thread_id UUID NOT NULL UNIQUE REFERENCES mail_threads(id) ON DELETE CASCADE,
  content TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create GIN index on content for full-text search (same as original)
CREATE INDEX idx_mail_thread_contents_content ON mail_thread_contents USING gin(to_tsvector('english', content));

-- Create index on thread_id for join performance
CREATE INDEX idx_mail_thread_contents_thread_id ON mail_thread_contents(thread_id);

-- Migrate existing data from mail_threads.content to mail_thread_contents
INSERT INTO mail_thread_contents (thread_id, content, created_at, updated_at)
SELECT id, content, created_at, updated_at
FROM mail_threads
WHERE content IS NOT NULL;

-- Log the migration
INSERT INTO processing_logs (process_type, status, message, metadata, completed_at)
VALUES (
  'migration',
  'success',
  'Extracted content column from mail_threads to mail_thread_contents table',
  jsonb_build_object(
    'migration', '20251201000001_extract_content_to_separate_table',
    'new_table', 'mail_thread_contents',
    'migrated_rows', (SELECT COUNT(*) FROM mail_thread_contents),
    'source_column', 'mail_threads.content'
  ),
  NOW()
);

