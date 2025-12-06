-- Remove content column from mail_threads table
-- This column has been moved to mail_thread_contents table

-- Drop the GIN index on content column
DROP INDEX IF EXISTS idx_mail_threads_content;

-- Drop the content column from mail_threads table
ALTER TABLE mail_threads 
DROP COLUMN IF EXISTS content;

-- Log the migration
INSERT INTO processing_logs (process_type, status, message, metadata, completed_at)
VALUES (
  'migration',
  'success',
  'Removed content column from mail_threads table',
  jsonb_build_object(
    'migration', '20251201000002_remove_content_column_from_mail_threads',
    'removed_column', 'content',
    'removed_index', 'idx_mail_threads_content',
    'new_location', 'mail_thread_contents.content'
  ),
  NOW()
);

