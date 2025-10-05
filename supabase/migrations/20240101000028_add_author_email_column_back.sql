-- Add author_email column back to mail_threads table
ALTER TABLE mail_threads 
ADD COLUMN author_email VARCHAR(255);

-- Create index for author_email column for better performance
CREATE INDEX idx_mail_threads_author_email ON mail_threads(author_email);

-- Log the migration
INSERT INTO processing_logs (process_type, status, message, metadata, completed_at)
VALUES (
  'migration',
  'success',
  'Added author_email column back to mail_threads table',
  jsonb_build_object(
    'migration', '20240101000028_add_author_email_column_back',
    'added_column', 'author_email',
    'column_type', 'VARCHAR(255)'
  ),
  NOW()
);

