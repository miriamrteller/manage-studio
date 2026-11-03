-- =============================================================================
-- Skins as data: a row in `verticals` describes a whole skin (names, the
-- default switches for new studios, main-noun wording, legal add-on, enquiry
-- questions, colours). The platform owner edits skins on /platform/skins.
--
-- Built-in skins (dance-studio, photographer, beautician, generic) keep their
-- code overlays; for them the app ignores label_overrides, so existing studios
-- (Creative Ballet included) look exactly as before. Default switches only
-- prefill the set-up wizard for NEW studios.
-- =============================================================================

ALTER TABLE verticals
  ADD COLUMN IF NOT EXISTS name_en          TEXT,
  ADD COLUMN IF NOT EXISTS name_he          TEXT,
  ADD COLUMN IF NOT EXISTS hint_en          TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS hint_he          TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS status           TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS marketing_pages  TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS default_switches JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS label_overrides  JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS legal_addon      TEXT,
  ADD COLUMN IF NOT EXISTS enquiry_presets  TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS colours          JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS sort_order       INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ NOT NULL DEFAULT now();

-- Existing skins: names and hints from today's wizard wording; switches from
-- today's profileDefaultsFor(); all live.
UPDATE verticals v SET
  name_en = s.name_en, name_he = s.name_he,
  hint_en = s.hint_en, hint_he = s.hint_he,
  status = 'live', sort_order = s.sort_order,
  default_switches = s.switches,
  legal_addon = s.legal_addon
FROM (VALUES
  ('dance-studio', 'Dance studio', 'סטודיו לריקוד',
     'Classes, terms and family billing', 'שיעורים, תקופות וחיוב משפחות', 10,
     '{"payment_flow":"recurring","teaches_classes":true,"family_accounts":true,"client_booking":false}'::jsonb, NULL),
  ('photographer', 'Photographer', 'צלם/ת',
     'Shoots, galleries and contracts', 'צילומים, גלריות וחוזים', 20,
     '{"payment_flow":"project","teaches_classes":false,"family_accounts":false,"client_booking":true}'::jsonb, 'photographer'),
  ('beautician', 'Beautician or salon', 'קוסמטיקה או מספרה',
     'Appointments and client cards', 'תורים וכרטיסי לקוח', 30,
     '{"payment_flow":"project","teaches_classes":false,"family_accounts":false,"client_booking":true}'::jsonb, 'beautician'),
  ('generic', 'Other', 'אחר',
     'General bookings and payments', 'הזמנות ותשלומים כלליים', 1000,
     '{"payment_flow":"both","teaches_classes":false,"family_accounts":false,"client_booking":false}'::jsonb, NULL)
) AS s(id, name_en, name_he, hint_en, hint_he, sort_order, switches, legal_addon)
WHERE v.id = s.id;

UPDATE verticals SET name_en = display_name WHERE name_en IS NULL;
UPDATE verticals SET name_he = display_name WHERE name_he IS NULL;
-- Every skin that existed before this migration is already offered: keep it live.
UPDATE verticals SET status = 'live';

ALTER TABLE verticals
  ALTER COLUMN name_en SET NOT NULL,
  ALTER COLUMN name_he SET NOT NULL;

ALTER TABLE verticals
  ADD CONSTRAINT verticals_id_format CHECK (id ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$'),
  ADD CONSTRAINT verticals_status_check CHECK (status IN ('draft', 'live')),
  ADD CONSTRAINT verticals_names_check CHECK (length(btrim(name_en)) BETWEEN 1 AND 80 AND length(btrim(name_he)) BETWEEN 1 AND 80),
  ADD CONSTRAINT verticals_hints_check CHECK (length(hint_en) <= 160 AND length(hint_he) <= 160),
  ADD CONSTRAINT verticals_legal_addon_check CHECK (legal_addon IS NULL OR legal_addon IN ('photographer', 'beautician', 'coaching')),
  ADD CONSTRAINT verticals_switches_check CHECK (
    jsonb_typeof(default_switches) = 'object'
    AND (NOT default_switches ? 'payment_flow'    OR default_switches->>'payment_flow' IN ('recurring', 'project', 'both'))
    AND (NOT default_switches ? 'teaches_classes' OR jsonb_typeof(default_switches->'teaches_classes') = 'boolean')
    AND (NOT default_switches ? 'family_accounts' OR jsonb_typeof(default_switches->'family_accounts') = 'boolean')
    AND (NOT default_switches ? 'client_booking'  OR jsonb_typeof(default_switches->'client_booking')  = 'boolean')
    AND (NOT default_switches ? 'health_declaration' OR jsonb_typeof(default_switches->'health_declaration') = 'boolean')
  ),
  ADD CONSTRAINT verticals_labels_check CHECK (jsonb_typeof(label_overrides) = 'object' AND pg_column_size(label_overrides) < 8192),
  ADD CONSTRAINT verticals_colours_check CHECK (
    jsonb_typeof(colours) = 'object'
    AND (NOT colours ? 'primary' OR colours->>'primary' ~ '^#[0-9A-Fa-f]{6}$')
    AND (NOT colours ? 'accent'  OR colours->>'accent'  ~ '^#[0-9A-Fa-f]{6}$')
  ),
  ADD CONSTRAINT verticals_enquiry_presets_check CHECK (enquiry_presets <@ ARRAY[
    'child_name', 'child_age', 'child_birth_date', 'class_interest', 'experience', 'preferred_days',
    'event_type', 'event_date', 'event_location', 'budget_range', 'service_interest', 'preferred_date'
  ]::text[]),
  ADD CONSTRAINT verticals_marketing_pages_check CHECK (cardinality(marketing_pages) <= 20);

-- display_name stays for older readers; it follows the English name. An insert
-- that only gives display_name (older seeds) gets it as both names.
CREATE OR REPLACE FUNCTION verticals_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.name_en := COALESCE(NEW.name_en, NEW.display_name);
  NEW.name_he := COALESCE(NEW.name_he, NEW.name_en);
  NEW.display_name := NEW.name_en;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS verticals_touch ON verticals;
CREATE TRIGGER verticals_touch
  BEFORE INSERT OR UPDATE ON verticals
  FOR EACH ROW EXECUTE FUNCTION verticals_touch();

-- Reads stay open (verticals_read USING true): the wizard shows only live skins,
-- and a studio on a skin set back to draft keeps its wording.
-- Writes: the existing verticals_super_admin policy (FOR ALL USING is_super_admin()).
GRANT INSERT, UPDATE ON verticals TO authenticated;

COMMENT ON COLUMN verticals.status IS 'draft = hidden from the set-up wizard; live = offered under "Your field".';
COMMENT ON COLUMN verticals.default_switches IS 'Prefills the wizard for NEW studios: payment_flow, teaches_classes, family_accounts, client_booking, health_declaration (optional). Never changes existing studios.';
COMMENT ON COLUMN verticals.label_overrides IS '{"en":{EntityKey:{singular,plural}},"he":{...}} main-noun wording. Ignored for built-in skins (dance-studio, photographer, beautician, generic), which keep their code wording.';
COMMENT ON COLUMN verticals.legal_addon IS 'One of the existing 07c add-ons (photographer, beautician, coaching), or NULL.';
COMMENT ON COLUMN verticals.enquiry_presets IS 'Ready-made enquiry-form questions (leadForm PresetKey) for new studios. Empty = the usual set for the studio kind.';
COMMENT ON COLUMN verticals.marketing_pages IS 'Marketing industry pages (slugs) whose sign-up links preselect this skin.';
