-- Fix the consent_template_immutable trigger.
-- The original trigger blocked ALL updates where both old and new status were in
-- ('approved', 'active'), which also prevented the legitimate approved → active
-- promotion. The intent was only to prevent editing the document content once
-- it had been approved — status transitions should still be allowed.
CREATE OR REPLACE FUNCTION prevent_consent_template_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Once a template is approved or active, its content/name/hash is locked.
  -- Status transitions (approved → active, active → archived, etc.) are fine.
  IF OLD.status IN ('approved', 'active') THEN
    IF (OLD.content      IS DISTINCT FROM NEW.content)
    OR (OLD.version_hash IS DISTINCT FROM NEW.version_hash)
    OR (OLD.name         IS DISTINCT FROM NEW.name) THEN
      RAISE EXCEPTION 'Cannot change the content or name of an approved or active consent template. Archive it and create a new version instead.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
