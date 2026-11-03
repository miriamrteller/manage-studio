-- Skins: a studio is created only on a live skin; drafts are refused on every path.
DO $$
DECLARE
  photo UUID := 'a0000000-0000-4000-8000-000000000001';
BEGIN
  INSERT INTO verticals (id, display_name, name_en, name_he, status)
  VALUES ('swim-coach', 'Swim coach', 'Swim coach', 'מאמן/ת שחייה', 'draft');

  BEGIN
    PERFORM provision_studio('Pool Kids', 'poolkids', 'essential', 'swim-coach', 'owner@example.com');
    RAISE EXCEPTION 'FAIL provision_studio accepted a draft skin';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE 'Skin is not live%' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO tenants (name, subdomain, contact_email, skin) VALUES ('Pool Kids', 'poolkids', 'o@example.com', 'swim-coach');
    RAISE EXCEPTION 'FAIL direct insert accepted a draft skin';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE 'Skin is not live%' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE tenants SET skin = 'swim-coach' WHERE id = photo;
    RAISE EXCEPTION 'FAIL a studio was moved to a draft skin';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE 'Skin is not live%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'ok  a draft skin is refused for new studios, direct inserts and skin changes';

  UPDATE verticals SET status = 'live' WHERE id = 'swim-coach';
  INSERT INTO tenants (name, subdomain, contact_email, skin) VALUES ('Pool Kids', 'poolkids', 'o@example.com', 'swim-coach');
  RAISE NOTICE 'ok  a live skin is accepted';

  -- Set back to draft: its studio keeps working (other edits are not blocked).
  UPDATE verticals SET status = 'draft' WHERE id = 'swim-coach';
  UPDATE tenants SET name = 'Pool Kids Club' WHERE subdomain = 'poolkids';
  RAISE NOTICE 'ok  a studio on a skin set back to draft can still be edited';

  IF EXISTS (SELECT 1 FROM verticals WHERE id IN ('dance-studio', 'photographer', 'beautician', 'generic') AND status <> 'live') THEN
    RAISE EXCEPTION 'FAIL a built-in skin is not live';
  END IF;
  RAISE NOTICE 'ok  the built-in skins are live';

  -- A new studio's enquiry form starts with the skin's chosen questions; a studio with its own settings keeps them.
  UPDATE verticals SET status = 'live', enquiry_presets = ARRAY['preferred_date', 'experience'] WHERE id = 'swim-coach';
  INSERT INTO tenants (name, subdomain, contact_email, skin) VALUES ('Lane Two', 'lanetwo', 'o@example.com', 'swim-coach');
  IF (SELECT lead_form FROM tenants WHERE subdomain = 'lanetwo')
     <> '{"presets":{"preferred_date":{"enabled":true,"required":false},"experience":{"enabled":true,"required":false}},"custom":[],"extra":["preferred_date","experience"]}'::jsonb THEN
    RAISE EXCEPTION 'FAIL enquiry presets not applied: %', (SELECT lead_form FROM tenants WHERE subdomain = 'lanetwo');
  END IF;
  INSERT INTO tenants (name, subdomain, contact_email, skin, lead_form)
  VALUES ('Lane Three', 'lanethree', 'o@example.com', 'swim-coach', '{"presets":{"service_interest":{"enabled":true,"required":true}},"custom":[]}');
  IF (SELECT lead_form->'presets' ? 'preferred_date' FROM tenants WHERE subdomain = 'lanethree') THEN
    RAISE EXCEPTION 'FAIL a studio''s own form settings were replaced';
  END IF;
  IF (SELECT lead_form FROM tenants WHERE subdomain = 'poolkids') IS DISTINCT FROM '{}'::jsonb THEN
    RAISE EXCEPTION 'FAIL an existing studio''s form changed';
  END IF;
  RAISE NOTICE 'ok  new studios start with the skin''s enquiry questions; own settings and existing studios are kept';
END $$;

\echo skins: all checks passed
