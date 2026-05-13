-- Migration 029: Add Student Visibility Policies
-- Adds fine-grained student access policies that depend on later tables
-- DEPENDENCIES: Migration 018 (class_sessions), Migration 026 (enrolments), Migration 002 (people)
-- REQUIRED BY: Phase 1C (student session visibility)

-- Enrolled students see their sessions
CREATE POLICY "enrolled students see sessions" ON class_sessions FOR SELECT
  USING (class_id IN (SELECT class_id FROM enrolments WHERE person_id IN (SELECT id FROM people WHERE user_profile_id = auth.uid())));

-- Families see sessions for classes their children are enrolled in
CREATE POLICY "families see enrolled sessions" ON class_sessions FOR SELECT
  USING (class_id IN (SELECT class_id FROM enrolments WHERE person_id IN (SELECT id FROM people WHERE family_id IN (SELECT family_id FROM family_members WHERE user_profile_id = auth.uid()))));
