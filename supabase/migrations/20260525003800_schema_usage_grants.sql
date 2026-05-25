-- Migration 038: Schema usage grants (required before table SELECT works)
-- If already applied manually, these are no-ops.

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;
