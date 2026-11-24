-- Fewer, clearly different font pairs (owner, 24 Nov 2026).
-- The settings list now offers: opalswift, classic, elegant, soft, bold, statement.
-- Studios that stored a removed pair move to the closest kept one, the same
-- mapping the app applies on read (RETIRED_FONT_PAIRS in
-- apps/web/src/hooks/useFontLoader.ts), so nothing visibly breaks.
UPDATE tenants
SET font_pair = CASE font_pair
  WHEN 'reliable' THEN 'opalswift'
  WHEN 'warm'     THEN 'opalswift'
  WHEN 'studio'   THEN 'opalswift'
  WHEN 'dynamic'  THEN 'soft'
  WHEN 'literary' THEN 'elegant'
END
WHERE font_pair IN ('reliable', 'warm', 'studio', 'dynamic', 'literary');
