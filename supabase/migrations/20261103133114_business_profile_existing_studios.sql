-- =============================================================================
-- Existing studios keep exactly the menu and features they have today now that the
-- menu follows the business profile instead of the skin.
--
-- The profile backfill (20261103130956) set every existing studio to "everything on".
-- Today's menu was decided by skin, so give each studio the profile that reproduces it:
--   photographer: sells projects (Jobs, Quotes), no classes, no families; payment_flow stays 'both'.
--   beautician:   no classes, no families, no projects.
--   everyone else (dance, generic, hq, creativeballet): classes and families stay on, no projects.
-- Only payment_flow / teaches_classes / family_accounts change; client_booking is untouched.
-- Studios created after the profile columns existed start with the switches off, so they are not
-- recognised as the untouched backfill and are left alone.
-- =============================================================================
-- Order matters: the untouched backfill is recognised by classes AND families both on.
UPDATE tenants SET payment_flow = 'recurring'
 WHERE skin <> 'photographer'
   AND payment_flow = 'both'
   AND teaches_classes AND family_accounts;

UPDATE tenants SET teaches_classes = false, family_accounts = false
 WHERE skin IN ('photographer', 'beautician')
   AND teaches_classes AND family_accounts;
