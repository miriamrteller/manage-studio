-- =============================================================================
-- More lead channels (docs/plans/LEADS.md, 2c "Get leads" + step 3)
--
-- The share links tag the form (?src=), and crm-lead-capture maps the tag to
-- leads.channel. New: facebook, google (Google Business profile), sms, flyer
-- (printed QR poster), direct (link sent to one person). For leads added by
-- hand: phone, walk_in, referral, other.
-- The external CRM contract (crm-contacts, contact.v1) maps unknown channels to
-- "Website", so it is unchanged.
--
-- ADDITIVE: widens a CHECK; no row changes.
-- =============================================================================

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_channel_check;
ALTER TABLE leads ADD CONSTRAINT leads_channel_check CHECK (channel IN (
  'email', 'website', 'whatsapp', 'linkedin', 'instagram',
  'facebook', 'google', 'sms', 'flyer', 'direct',
  'phone', 'walk_in', 'referral', 'other'
));
