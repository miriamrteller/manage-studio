-- Edge functions (create-checkout, stripe-webhook, etc.) use the service_role key.
-- Migration 018 only granted ALL on tenants + user_profiles; other tables returned
-- permission errors that create-checkout surfaced as "Engagement not found" (404).

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
