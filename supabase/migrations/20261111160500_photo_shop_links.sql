-- Photo shop: "Send shop link". The studio sends the shoot's client a link that signs
-- them straight in to their photos for 3 days (owner, 11 Nov 2026).
--
-- Only a SHA-256 hash of the link's token is stored. The table is read and written
-- only by the photo-shop-link Edge Function (service role): no policies, no grants.

CREATE TABLE IF NOT EXISTS public.photo_shop_links (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  engagement_id UUID        NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE,
  token_hash    TEXT        NOT NULL UNIQUE,
  created_by    UUID        REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  last_used_at  TIMESTAMPTZ
);

COMMENT ON TABLE public.photo_shop_links IS
  'Photo shop sign-in links (Send shop link): sha256 of the token, the shoot, and when it stops working (3 days). Service role only.';

CREATE INDEX IF NOT EXISTS photo_shop_links_engagement_idx ON public.photo_shop_links (engagement_id);

ALTER TABLE public.photo_shop_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.photo_shop_links FROM PUBLIC, anon, authenticated;
