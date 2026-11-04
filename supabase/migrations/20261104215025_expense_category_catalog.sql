-- =============================================================================
-- 20261104215025: expense categories in English and Hebrew, with a set per skin.
--
--  * expense_category_catalog: the common categories, each with an English and
--    a Hebrew name and a default for is_vat_eligible (whether the expense form
--    asks for the supplier's VAT number). [[ACCOUNTANT: confirm]] the defaults
--    (docs/legal/AWAITING-LAWYER-REVIEW.md).
--  * verticals.expense_categories: the catalogue keys a NEW studio on that skin
--    starts with, switched on. A skin without a list (a new data skin) uses
--    the generic one.
--  * expense_categories.catalog_key: a studio's row that is one of the common
--    categories. The app shows the catalogue name in the reader's language;
--    a studio's own categories (no key) keep the name it typed.
--  * New studios: a trigger on tenants adds the skin's set. The older lists
--    that provision_studio and provision_tenant still insert in the same
--    transaction are skipped when they match a catalogue category, so a new
--    studio gets exactly its skin's set.
--  * Existing studios: their current categories are matched to the catalogue
--    by name. Nothing is added or switched on for them.
--
-- ADDITIVE MIGRATION: one new table, two new columns, two triggers, a backfill.
-- =============================================================================

CREATE TABLE IF NOT EXISTS expense_category_catalog (
  key             TEXT    PRIMARY KEY CHECK (key ~ '^[a-z_]+$'),
  name_en         TEXT    NOT NULL,
  name_he         TEXT    NOT NULL,
  is_vat_eligible BOOLEAN NOT NULL,
  sort_order      INT     NOT NULL
);

COMMENT ON TABLE expense_category_catalog IS
  'Common expense categories (EN + HE). Studios switch them on in Finance > Expense categories. is_vat_eligible defaults: [[ACCOUNTANT: confirm]].';

ALTER TABLE expense_category_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY expense_category_catalog_read ON expense_category_catalog FOR SELECT USING (true);
CREATE POLICY expense_category_catalog_super_admin ON expense_category_catalog FOR ALL USING (is_super_admin());
REVOKE ALL ON expense_category_catalog FROM PUBLIC, anon, authenticated;
GRANT SELECT ON expense_category_catalog TO authenticated;

INSERT INTO expense_category_catalog (key, name_en, name_he, is_vat_eligible, sort_order) VALUES
  ('rent',                  'Rent',                                                 'שכירות',                 true,  10),
  ('municipal_tax',         'Municipal tax (arnona)',                               'ארנונה',                 false, 20),
  ('utilities',             'Electricity and water',                                'חשמל ומים',              true,  30),
  ('phone_internet',        'Phone and internet',                                   'טלפון ואינטרנט',         true,  40),
  ('staff_wages',           'Staff wages',                                          'שכר עובדים',             false, 50),
  ('freelancers',           'Freelancers and subcontractors',                       'פרילנסרים וקבלני משנה',  true,  60),
  ('equipment',             'Equipment',                                            'ציוד',                   true,  70),
  ('supplies',              'Materials and supplies',                               'חומרים ומתכלים',         true,  80),
  ('products_resale',       'Products for resale',                                  'מוצרים למכירה',          true,  90),
  ('office',                'Office supplies',                                      'ציוד משרדי',             true,  100),
  ('software',              'Software and subscriptions',                           'תוכנה ומנויים',          true,  110),
  ('marketing',             'Marketing and advertising',                            'שיווק ופרסום',           true,  120),
  ('professional_services', 'Professional services (accountant, lawyer, consultant)', 'שירותים מקצועיים',     true,  130),
  ('bank_fees',             'Bank and card fees',                                   'עמלות בנק וסליקה',       false, 140),
  ('insurance',             'Insurance',                                            'ביטוח',                  true,  150),
  ('travel',                'Travel and fuel',                                      'נסיעות ודלק',            true,  160),
  ('vehicle',               'Vehicle costs',                                        'הוצאות רכב',             true,  170),
  ('training',              'Training and courses',                                 'השתלמויות וקורסים',      true,  180),
  ('maintenance',           'Repairs and maintenance',                              'תיקונים ותחזוקה',        true,  190),
  ('cleaning',              'Cleaning',                                             'ניקיון',                 true,  200),
  ('refreshments',          'Refreshments and hosting',                             'כיבוד ואירוח',           true,  210),
  ('costumes',              'Costumes and performances',                            'תלבושות והופעות',        true,  220),
  ('music_licences',        'Music licences',                                       'רישיונות למוזיקה',       true,  230),
  ('venue_hire',            'Hall and venue hire',                                  'השכרת אולמות',           true,  240),
  ('props_backdrops',       'Props and backdrops',                                  'אביזרים ורקעים',         true,  250),
  ('printing',              'Printing and albums',                                  'הדפסות ואלבומים',        true,  260),
  ('other',                 'Other',                                                'אחר',                    true,  1000)
ON CONFLICT (key) DO NOTHING;

-- ── The set a new studio on each skin starts with ───────────────────────────
ALTER TABLE verticals ADD COLUMN IF NOT EXISTS expense_categories TEXT[];
COMMENT ON COLUMN verticals.expense_categories IS
  'Catalogue keys (expense_category_catalog) a new studio on this skin starts with. NULL = the generic skin''s list.';

UPDATE verticals SET expense_categories = s.keys
FROM (VALUES
  ('generic',      ARRAY['rent','utilities','phone_internet','staff_wages','freelancers','equipment','supplies','software','marketing','professional_services','bank_fees','insurance','travel','other']),
  ('dance-studio', ARRAY['rent','municipal_tax','utilities','staff_wages','equipment','software','marketing','professional_services','bank_fees','insurance','maintenance','cleaning','costumes','music_licences','venue_hire','other']),
  ('photographer', ARRAY['phone_internet','freelancers','equipment','software','marketing','professional_services','bank_fees','insurance','travel','vehicle','training','props_backdrops','printing','other']),
  ('beautician',   ARRAY['rent','utilities','equipment','supplies','products_resale','software','marketing','professional_services','bank_fees','insurance','training','maintenance','cleaning','other'])
) AS s(id, keys)
WHERE verticals.id = s.id AND verticals.expense_categories IS NULL;

-- ── A studio's row that is a catalogue category ─────────────────────────────
ALTER TABLE expense_categories
  ADD COLUMN IF NOT EXISTS catalog_key TEXT REFERENCES expense_category_catalog(key);
CREATE UNIQUE INDEX IF NOT EXISTS uq_expense_categories_tenant_catalog_key
  ON expense_categories (tenant_id, catalog_key) WHERE catalog_key IS NOT NULL;
COMMENT ON COLUMN expense_categories.catalog_key IS
  'Set when the row is a common category: the app shows its English/Hebrew name. NULL = the studio''s own category.';

-- Older names (the lists provision_studio and provision_tenant insert) → catalogue key.
CREATE OR REPLACE FUNCTION private.expense_catalog_key_for_name(p_name TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT m.key FROM (VALUES
       ('שכירות סטודיו', 'rent'),
       ('שכר מורים',     'staff_wages'),
       ('שיווק',         'marketing')
     ) AS m(name, key)
     WHERE m.name = btrim(p_name)),
    (SELECT c.key FROM expense_category_catalog c
     WHERE lower(btrim(p_name)) IN (lower(c.name_he), lower(c.name_en))
     LIMIT 1)
  );
$$;
REVOKE ALL ON FUNCTION private.expense_catalog_key_for_name(TEXT) FROM PUBLIC, anon, authenticated;

-- A new studio gets its skin's set, switched on.
CREATE OR REPLACE FUNCTION private.seed_expense_categories()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_keys TEXT[];
BEGIN
  SELECT expense_categories INTO v_keys FROM verticals WHERE id = NEW.skin;
  IF v_keys IS NULL THEN
    SELECT expense_categories INTO v_keys FROM verticals WHERE id = 'generic';
  END IF;

  INSERT INTO expense_categories (tenant_id, name, is_vat_eligible, sort_order, catalog_key)
  SELECT NEW.id, c.name_he, c.is_vat_eligible, c.sort_order, c.key
  FROM expense_category_catalog c
  WHERE c.key = ANY(coalesce(v_keys, ARRAY[]::TEXT[]))
  ON CONFLICT DO NOTHING;

  -- The older lists inserted later in this transaction are skipped (see below).
  PERFORM set_config('opalswift.expense_seeded_tenant', NEW.id::TEXT, true);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.seed_expense_categories() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tenants_seed_expense_categories ON tenants;
CREATE TRIGGER tenants_seed_expense_categories
  AFTER INSERT ON tenants
  FOR EACH ROW EXECUTE FUNCTION private.seed_expense_categories();

-- While a studio is being created, an older default that matches a catalogue
-- category is skipped: the skin's set already decided which ones it has.
CREATE OR REPLACE FUNCTION private.skip_legacy_expense_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.catalog_key IS NULL
     AND current_setting('opalswift.expense_seeded_tenant', true) = NEW.tenant_id::TEXT
     AND private.expense_catalog_key_for_name(NEW.name) IS NOT NULL THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.skip_legacy_expense_defaults() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS expense_categories_skip_legacy_defaults ON expense_categories;
CREATE TRIGGER expense_categories_skip_legacy_defaults
  BEFORE INSERT ON expense_categories
  FOR EACH ROW EXECUTE FUNCTION private.skip_legacy_expense_defaults();

-- ── Existing studios: match their categories to the catalogue ───────────────
-- One row per studio and key (the earliest), so the unique index holds.
WITH matched AS (
  SELECT DISTINCT ON (ec.tenant_id, k.key) ec.id, k.key
  FROM expense_categories ec
  CROSS JOIN LATERAL (SELECT private.expense_catalog_key_for_name(ec.name) AS key) k
  WHERE ec.catalog_key IS NULL AND k.key IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM expense_categories o
                    WHERE o.tenant_id = ec.tenant_id AND o.catalog_key = k.key)
  ORDER BY ec.tenant_id, k.key, ec.sort_order, ec.created_at
)
UPDATE expense_categories ec
SET catalog_key = matched.key, updated_at = now()
FROM matched
WHERE ec.id = matched.id;
