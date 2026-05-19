-- Migration 031: Add Billing Account Policies
-- Adds policies that reference columns created in later migrations
-- DEPENDENCIES: Migration 023 (billing_accounts), Migration 024 (people.billing_account_id), Migration 026 (enrolments)
-- REQUIRED BY: Phase 1C (billing visibility)

-- Policy for people to see their own billing accounts
CREATE POLICY "account holders see own billing_accounts" ON billing_accounts FOR SELECT
  USING (id IN (SELECT billing_account_id FROM people WHERE billing_account_id IS NOT NULL AND user_profile_id = auth.uid()));

-- Policy for families to see billing accounts linked to their enrolled children
CREATE POLICY "families see enrolled billing_accounts" ON billing_accounts FOR SELECT
  USING (id IN (SELECT billing_account_id FROM enrolments WHERE billing_account_id IS NOT NULL AND person_id IN (SELECT id FROM people WHERE family_id IN (SELECT family_id FROM family_members WHERE user_profile_id = auth.uid()))));