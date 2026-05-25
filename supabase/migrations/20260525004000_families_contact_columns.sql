-- Migration: Add contact columns to families table
-- The FamilyForm collects name, contact_person_name, contact_email, contact_phone
-- at family creation. These fields were missing from the initial families table.
-- DEPENDENCIES: Migration 002 (families table)

ALTER TABLE families
  ADD COLUMN IF NOT EXISTS name                TEXT,
  ADD COLUMN IF NOT EXISTS contact_person_name TEXT,
  ADD COLUMN IF NOT EXISTS contact_email       TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone       TEXT;
