-- Photo shop: SmugMug photo links are refreshed from SmugMug, not kept for ever.
--
-- "Check gallery" saved each photo's preview link once (smugmug_photos). Those links can
-- stop opening later, which left clients with an empty shop. The client-photo-shop Edge
-- Function now re-reads the links from SmugMug when the saved ones are older than a few
-- hours (or when none of them loaded in the browser) and saves them here.

ALTER TABLE job_photo_shops
  ADD COLUMN smugmug_photos_refreshed_at TIMESTAMPTZ;

COMMENT ON COLUMN job_photo_shops.smugmug_photos_refreshed_at IS
  'When smugmug_photos links were last re-read from SmugMug after the check. NULL = not since the check (smugmug_checked_at).';
