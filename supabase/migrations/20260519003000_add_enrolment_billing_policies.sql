-- Migration 030: Add Enrolment Billing Policies
-- Adds policies to billing_accounts that reference enrolments table
-- DEPENDENCIES: Migration 023 (billing_accounts), Migration 026 (enrolments)
-- REQUIRED BY: Phase 1C (billing visibility)

-- Add policy allowing families to see billing accounts for classes their children are enrolled in
CREATE POLICY "families see enrolled billing_accounts" ON billing_accounts FOR SELECT
  USING (id IN (SELECT billing_account_id FROM enrolments WHERE billing_account_id IS NOT NULL AND person_id IN (SELECT id FROM people WHERE family_id IN (SELECT family_id FROM family_members WHERE user_profile_id = auth.uid()))));