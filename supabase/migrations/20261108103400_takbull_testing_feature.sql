-- =============================================================================
-- 20261108103400: a beta switch for the Takbull keys form (testing only).
--
-- Feature 'billing:takbull_testing' with profile_gate 'opt_in': never switched on by plan
-- or profile, only by a tenant override (Platform -> Features). It shows the Takbull keys
-- form with Test connection on Settings -> Payments, so the owner can save Takbull's test
-- keys for her test studio. It doesn't change any studio's payment provider.
--
-- DEPENDENCIES: 20261104171055 (profile_gate 'opt_in'), 20261104165330 (Takbull keys)
-- =============================================================================

INSERT INTO feature_definitions (key, description, tier_minimum, skin_restriction, profile_gate) VALUES
  ('billing:takbull_testing', 'Takbull keys and Test connection on Settings -> Payments (testing only)', 'essential', NULL, 'opt_in')
ON CONFLICT (key) DO NOTHING;
UPDATE feature_definitions SET profile_gate = 'opt_in' WHERE key = 'billing:takbull_testing';
