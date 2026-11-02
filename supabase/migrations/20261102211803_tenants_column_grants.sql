-- tenants uses column-level SELECT grants (20260608002700_grants.sql): the
-- table grant was revoked and only the columns that existed then, minus the
-- secret *_enc ones, were granted. Columns added since need their own grant,
-- and these ten never got one, so a signed-in select naming any of them fails
-- with "permission denied for table tenants" (e.g. useMyStudios and
-- signup_source, issue #223). None is secret; row access is still RLS.
-- The security suite now checks every non-*_enc column is readable.
GRANT SELECT (
  chrome_style,
  logo_tone,
  logo_dark_tone,
  logo_autofix,
  offline_payment_instructions,
  custom_domain,
  signup_source,
  legal_pack_required,
  legal_pack_acknowledged_at,
  legal_pack_ack_drafts
) ON TABLE public.tenants TO authenticated;
