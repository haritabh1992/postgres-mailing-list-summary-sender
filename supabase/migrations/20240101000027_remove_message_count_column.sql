-- Remove message_count column from mail_threads table
ALTER TABLE mail_threads 
DROP COLUMN IF EXISTS message_count;

-- Log the migration
INSERT INTO processing_logs (process_type, status, message, metadata, completed_at)
VALUES (
  'migration',
  'success',
  'Removed message_count column from mail_threads table',
  jsonb_build_object(
    'migration', '20240101000027_remove_message_count_column',
    'removed_column', 'message_count'
  ),
  NOW()
);
