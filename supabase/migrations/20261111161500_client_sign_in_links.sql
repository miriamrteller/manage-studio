-- Client sign-in links: the booking and enrolment confirmation emails carry a button
-- that signs the client straight in to their page for 3 days (owner, 11 Nov 2026:
-- "every booked client needs to automatically get an account and sign in").
--
-- Only a SHA-256 hash of the link's token is stored. The table is read and written
-- only by Edge Functions (service role): no policies, no grants.

CREATE TABLE IF NOT EXISTS public.client_sign_in_links (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_profile_id UUID        NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  engagement_id   UUID        REFERENCES public.engagements(id) ON DELETE SET NULL,
  token_hash      TEXT        NOT NULL UNIQUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL,
  last_used_at    TIMESTAMPTZ
);

COMMENT ON TABLE public.client_sign_in_links IS
  'Sign-in links in booking emails: sha256 of the token, whose login it signs in, and when it stops working (3 days). Service role only.';

CREATE INDEX IF NOT EXISTS client_sign_in_links_user_idx ON public.client_sign_in_links (user_profile_id);
CREATE INDEX IF NOT EXISTS client_sign_in_links_engagement_idx ON public.client_sign_in_links (engagement_id);

ALTER TABLE public.client_sign_in_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_sign_in_links FROM PUBLIC, anon, authenticated;
