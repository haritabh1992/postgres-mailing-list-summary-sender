-- Add redirect slug support for new mail threads
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE mail_threads
  ADD COLUMN IF NOT EXISTS redirect_slug TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS mail_threads_redirect_slug_key
  ON mail_threads(redirect_slug)
  WHERE redirect_slug IS NOT NULL;

CREATE OR REPLACE FUNCTION set_mail_threads_redirect_slug()
RETURNS TRIGGER AS $$
DECLARE
  generated_slug TEXT;
BEGIN
  IF NEW.redirect_slug IS NULL OR NEW.redirect_slug = '' THEN
    LOOP
      generated_slug := lower(encode(gen_random_bytes(6), 'hex'));

      -- exit loop if slug is unique
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM mail_threads WHERE redirect_slug = generated_slug
      );
    END LOOP;

    NEW.redirect_slug := generated_slug;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_mail_threads_redirect_slug ON mail_threads;

CREATE TRIGGER set_mail_threads_redirect_slug
  BEFORE INSERT ON mail_threads
  FOR EACH ROW
  EXECUTE FUNCTION set_mail_threads_redirect_slug();

