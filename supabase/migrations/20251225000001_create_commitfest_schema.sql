-- Create commitfest schema for storing commitfest data
CREATE SCHEMA IF NOT EXISTS commitfest;

-- Ensure pgcrypto extension is available for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create patches table to store patch metadata from commitfest
CREATE TABLE commitfest.patches (
  patch_id INTEGER PRIMARY KEY,
  patch_url VARCHAR(500) NOT NULL,
  title TEXT,
  status VARCHAR(100),
  tags TEXT[] DEFAULT '{}',
  author VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE,
  last_modified TIMESTAMP WITH TIME ZONE,
  last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at_db TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create mail_threads table to store mail thread information from commitfest
CREATE TABLE commitfest.mail_threads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  mail_thread_url VARCHAR(500) NOT NULL UNIQUE,
  subject TEXT,
  subject_normalized TEXT, -- Normalized subject for matching
  extracted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create junction table to link patches to their mail threads (many-to-many)
CREATE TABLE commitfest.patch_mail_threads (
  patch_id INTEGER NOT NULL REFERENCES commitfest.patches(patch_id) ON DELETE CASCADE,
  mail_thread_id UUID NOT NULL REFERENCES commitfest.mail_threads(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (patch_id, mail_thread_id)
);

-- Create sync_log table to track scraping operations
CREATE TABLE commitfest.sync_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sync_type VARCHAR(20) NOT NULL CHECK (sync_type IN ('full', 'incremental')),
  status VARCHAR(20) NOT NULL CHECK (status IN ('in_progress', 'completed', 'failed')),
  patches_processed INTEGER DEFAULT 0,
  threads_processed INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_commitfest_patches_patch_id ON commitfest.patches(patch_id);
CREATE INDEX idx_commitfest_patches_last_synced ON commitfest.patches(last_synced_at);
CREATE INDEX idx_commitfest_mail_threads_url ON commitfest.mail_threads(mail_thread_url);
CREATE INDEX idx_commitfest_mail_threads_subject_normalized ON commitfest.mail_threads(subject_normalized);
CREATE INDEX idx_commitfest_patch_mail_threads_patch_id ON commitfest.patch_mail_threads(patch_id);
CREATE INDEX idx_commitfest_patch_mail_threads_mail_thread_id ON commitfest.patch_mail_threads(mail_thread_id);
CREATE INDEX idx_commitfest_sync_log_status ON commitfest.sync_log(status, started_at);

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_commitfest_patches_updated_at BEFORE UPDATE ON commitfest.patches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_commitfest_mail_threads_updated_at BEFORE UPDATE ON commitfest.mail_threads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create helper function to insert sync log (for edge functions)
-- Create in public schema so it can be called via RPC
CREATE OR REPLACE FUNCTION commitfest_insert_sync_log(
  p_sync_type VARCHAR(20),
  p_status VARCHAR(20),
  p_patches_processed INTEGER DEFAULT 0,
  p_threads_processed INTEGER DEFAULT 0
)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO commitfest.sync_log (sync_type, status, patches_processed, threads_processed, started_at)
  VALUES (p_sync_type, p_status, p_patches_processed, p_threads_processed, NOW())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create helper function to update sync log
CREATE OR REPLACE FUNCTION commitfest_update_sync_log(
  p_id UUID,
  p_status VARCHAR(20),
  p_patches_processed INTEGER DEFAULT NULL,
  p_threads_processed INTEGER DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  UPDATE commitfest.sync_log
  SET 
    status = p_status,
    patches_processed = COALESCE(p_patches_processed, patches_processed),
    threads_processed = COALESCE(p_threads_processed, threads_processed),
    completed_at = CASE WHEN p_status IN ('completed', 'failed') THEN NOW() ELSE completed_at END,
    error_message = COALESCE(p_error_message, error_message)
  WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create helper function to upsert patch
CREATE OR REPLACE FUNCTION commitfest_upsert_patch(
  p_patch_id INTEGER,
  p_patch_url VARCHAR(500),
  p_title TEXT,
  p_status VARCHAR(100),
  p_tags TEXT[],
  p_author VARCHAR(255),
  p_created_at TIMESTAMP WITH TIME ZONE,
  p_last_modified TIMESTAMP WITH TIME ZONE
)
RETURNS void AS $$
BEGIN
  INSERT INTO commitfest.patches (
    patch_id, patch_url, title, status, tags, author, 
    created_at, last_modified, last_synced_at, updated_at
  )
  VALUES (
    p_patch_id, p_patch_url, p_title, p_status, p_tags, p_author,
    p_created_at, p_last_modified, NOW(), NOW()
  )
  ON CONFLICT (patch_id) DO UPDATE SET
    patch_url = EXCLUDED.patch_url,
    title = EXCLUDED.title,
    status = EXCLUDED.status,
    tags = EXCLUDED.tags,
    author = EXCLUDED.author,
    created_at = EXCLUDED.created_at,
    last_modified = EXCLUDED.last_modified,
    last_synced_at = NOW(),
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create helper function to upsert mail thread
CREATE OR REPLACE FUNCTION commitfest_upsert_mail_thread(
  p_mail_thread_url VARCHAR(500),
  p_subject TEXT DEFAULT NULL,
  p_subject_normalized TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO commitfest.mail_threads (
    mail_thread_url, subject, subject_normalized, updated_at
  )
  VALUES (
    p_mail_thread_url, p_subject, p_subject_normalized, NOW()
  )
  ON CONFLICT (mail_thread_url) DO UPDATE SET
    subject = COALESCE(EXCLUDED.subject, commitfest.mail_threads.subject),
    subject_normalized = COALESCE(EXCLUDED.subject_normalized, commitfest.mail_threads.subject_normalized),
    updated_at = NOW()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create helper function to link patch to mail thread
CREATE OR REPLACE FUNCTION commitfest_link_patch_mail_thread(
  p_patch_id INTEGER,
  p_mail_thread_id UUID
)
RETURNS void AS $$
BEGIN
  INSERT INTO commitfest.patch_mail_threads (patch_id, mail_thread_id, created_at)
  VALUES (p_patch_id, p_mail_thread_id, NOW())
  ON CONFLICT (patch_id, mail_thread_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA commitfest TO postgres, anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA commitfest TO postgres;
GRANT SELECT ON ALL TABLES IN SCHEMA commitfest TO anon, authenticated;
GRANT EXECUTE ON FUNCTION commitfest_insert_sync_log TO postgres, anon, authenticated;
GRANT EXECUTE ON FUNCTION commitfest_update_sync_log TO postgres, anon, authenticated;
GRANT EXECUTE ON FUNCTION commitfest_upsert_patch TO postgres, anon, authenticated;
GRANT EXECUTE ON FUNCTION commitfest_upsert_mail_thread TO postgres, anon, authenticated;
GRANT EXECUTE ON FUNCTION commitfest_link_patch_mail_thread TO postgres, anon, authenticated;

