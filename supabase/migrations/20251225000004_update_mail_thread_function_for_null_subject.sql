-- Update commitfest_upsert_mail_thread to allow NULL subjects and preserve existing values on update

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

