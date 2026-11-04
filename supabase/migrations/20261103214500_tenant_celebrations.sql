-- =============================================================================
-- "Fun setup": which one-time celebrations a studio has already seen, and the
-- studio's "Fewer celebrations" choice.
--
--   { "fired": { "setup_done": "<iso>", "first_enquiry": "<iso>", "first_paid": "<iso>" },
--     "fewer": true }
--
-- Each moment fires once per studio (not per device), so it lives on the
-- tenant row; studio admins update it like other studio settings (existing
-- tenants RLS). Nothing sensitive.
-- =============================================================================

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS celebrations JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_celebrations_object;
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_celebrations_object
  CHECK (jsonb_typeof(celebrations) = 'object' AND pg_column_size(celebrations) < 4096);

COMMENT ON COLUMN public.tenants.celebrations IS
  'Setup celebrations: {"fired": {moment: iso time}, "fewer": bool}. Each moment fires once per studio.';

-- tenants SELECT is granted per column: signed-in users (the studio's admins,
-- through the existing RLS) may read it; visitors may not.
GRANT SELECT (celebrations) ON TABLE public.tenants TO authenticated;
