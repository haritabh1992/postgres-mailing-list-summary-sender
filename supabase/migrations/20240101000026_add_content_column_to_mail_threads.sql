-- Add content column to mail_threads table
ALTER TABLE mail_threads 
ADD COLUMN content TEXT;

-- Create index for content column for better performance
CREATE INDEX idx_mail_threads_content ON mail_threads USING gin(to_tsvector('english', content));

-- Log the migration
INSERT INTO processing_logs (process_type, status, message, metadata, completed_at)
VALUES (
  'migration',
  'success',
  'Added content column to mail_threads table',
  jsonb_build_object(
    'migration', '20240101000026_add_content_column_to_mail_threads',
    'added_column', 'content',
    'column_type', 'TEXT'
  ),
  NOW()
);
