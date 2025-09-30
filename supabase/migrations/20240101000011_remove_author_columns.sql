-- Remove author_name and author_email columns from mail_threads table
ALTER TABLE mail_threads 
DROP COLUMN IF EXISTS author_name,
DROP COLUMN IF EXISTS author_email;
