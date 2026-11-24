-- =============================================================================
-- "Ask OpalSwift": read-only AI help for studio admins (beta).
--
--   * Feature 'platform:assistant.help', profile_gate 'opt_in': off for every
--     studio until the platform owner switches it on for that studio
--     (Platform > Features). Same pattern as the studio shop beta.
--   * No new tables. The assistant-chat Edge Function writes one audit_log row
--     per question (action 'assistant_question', token counts only, no text)
--     and counts those rows for the daily limit. Only a question the guides
--     don't cover is kept, in studio_feedback (kind 'help'), so a guide gets written.
--
-- ADDITIVE MIGRATION: one feature_definitions row.
-- DEPENDENCIES: 20261104171055 (feature_definitions.profile_gate)
-- =============================================================================

INSERT INTO feature_definitions (key, description, tier_minimum, skin_restriction, profile_gate) VALUES
  ('platform:assistant.help', 'Ask OpalSwift: AI answers from the help guides, read-only (beta)', 'essential', NULL, 'opt_in')
ON CONFLICT (key) DO NOTHING;
UPDATE feature_definitions SET profile_gate = 'opt_in' WHERE key = 'platform:assistant.help';
