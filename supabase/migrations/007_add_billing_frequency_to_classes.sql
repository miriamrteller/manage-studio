-- Add billing_frequency column to classes table
-- Purpose: Support per-class billing models (monthly, per-session, weekly, annual)
-- Date: May 10, 2026

ALTER TABLE classes 
ADD COLUMN billing_frequency VARCHAR(50) DEFAULT 'monthly' NOT NULL;

-- Add index for efficient filtering
CREATE INDEX idx_classes_billing_frequency ON classes(billing_frequency);
