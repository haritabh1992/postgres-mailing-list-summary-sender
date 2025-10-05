-- Rename author_email column to author_name in mail_threads table
ALTER TABLE mail_threads 
RENAME COLUMN author_email TO author_name;

-- Drop the old index and create a new one for author_name
DROP INDEX IF EXISTS idx_mail_threads_author_email;
CREATE INDEX idx_mail_threads_author_name ON mail_threads(author_name);

-- Log the migration
INSERT INTO processing_logs (process_type, status, message, metadata, completed_at)
VALUES (
  'migration',
  'success',
  'Renamed author_email column to author_name in mail_threads table',
  jsonb_build_object(
    'migration', '20240101000029_rename_author_email_to_author_name',
    'renamed_column', 'author_email -> author_name',
    'column_type', 'VARCHAR(255)'
  ),
  NOW()
);

