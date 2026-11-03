-- =============================================================================
-- Admin "Send form" links prefill the enquiry form (prefill audit row 20).
--
-- send-lead-form-link stores a random 256-bit token's sha256 here and puts the
-- token only in the link's URL fragment (#invite=…), never the name or email.
-- The form looks the token up with get_lead_form_invite() and prefills the
-- name and email the admin typed. Valid 14 days (owner decision), read-only
-- (a reload still works); a submitted enquiry links its lead to the invite.
-- Expired invites are deleted 30 days after expiry by a daily job.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.lead_form_invites (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  token_hash      TEXT        NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  recipient_email TEXT        NOT NULL CHECK (length(recipient_email) BETWEEN 3 AND 254),
  recipient_name  TEXT        CHECK (recipient_name IS NULL OR length(recipient_name) <= 80),
  form_id         UUID        REFERENCES public.lead_forms(id) ON DELETE SET NULL,
  created_by      UUID        REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '14 days',
  used_at         TIMESTAMPTZ,
  lead_id         UUID        REFERENCES public.leads(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.lead_form_invites IS
  'Admin-sent enquiry-form links: only the token''s sha256 is stored. Read through get_lead_form_invite(); written by the service role.';

CREATE INDEX IF NOT EXISTS lead_form_invites_expires_at ON public.lead_form_invites (expires_at);

ALTER TABLE public.lead_form_invites ENABLE ROW LEVEL SECURITY;
-- No policies: clients never touch the table directly.
REVOKE ALL ON public.lead_form_invites FROM PUBLIC, anon, authenticated;

-- The name and email an admin's link was sent to, for the form to prefill.
-- Nothing for a wrong, expired or other studio's token.
CREATE OR REPLACE FUNCTION public.get_lead_form_invite(p_tenant_id UUID, p_token TEXT)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT jsonb_build_object('name', i.recipient_name, 'email', i.recipient_email)
  FROM lead_form_invites i
  WHERE p_token IS NOT NULL
    AND length(p_token) BETWEEN 32 AND 128
    AND i.tenant_id = p_tenant_id
    AND i.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
    AND i.expires_at > now()
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.get_lead_form_invite(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_lead_form_invite(UUID, TEXT) TO anon, authenticated, service_role;

-- Daily clean-up: invites gone 30 days after they expire.
CREATE OR REPLACE FUNCTION public.purge_expired_lead_form_invites()
RETURNS INTEGER LANGUAGE sql
SET search_path = public AS $$
  WITH gone AS (
    DELETE FROM lead_form_invites WHERE expires_at < now() - INTERVAL '30 days' RETURNING 1
  )
  SELECT count(*)::int FROM gone;
$$;

REVOKE EXECUTE ON FUNCTION public.purge_expired_lead_form_invites() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_lead_form_invites() TO service_role;

SELECT cron.unschedule(jobid) FROM cron.job WHERE command ILIKE '%purge_expired_lead_form_invites%';
SELECT cron.schedule('41 3 * * *', $$ SELECT public.purge_expired_lead_form_invites(); $$);
