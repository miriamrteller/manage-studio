-- Migration 005: Add email column to user_profiles
-- REASON: Denormalization for UI display (source of truth remains auth.users)
-- DEPENDENCIES: Migration 001 (user_profiles table must exist)
-- CREATED: Phase 1B post-audit

ALTER TABLE user_profiles ADD COLUMN email TEXT;

-- Add index for lookups by email (useful for admin searches in Phase 1C)
CREATE INDEX idx_user_profiles_email ON user_profiles(email);

-- Document: Email is denormalized. Primary source of truth is auth.users.email
-- When creating user_profile, copy email from auth.users
-- When updating email, update both auth.users and user_profiles
