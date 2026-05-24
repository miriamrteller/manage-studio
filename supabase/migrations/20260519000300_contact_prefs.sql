-- Migration 003: Contact Preferences
-- Manages communication channels and preferences per person
-- DEPENDENCIES: Migration 002 must be complete (references people and family_members)
-- REQUIRED BY: Notifications, Edge Functions

CREATE TABLE contact_preferences (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID        NOT NULL REFERENCES tenants(id),
  person_id           UUID        REFERENCES people(id),
  family_member_id    UUID        REFERENCES family_members(id),
  email               TEXT,
  email_opted_in      BOOLEAN     NOT NULL DEFAULT true,
  whatsapp_number     TEXT,
  whatsapp_opted_in   BOOLEAN     NOT NULL DEFAULT false,
  whatsapp_verified   BOOLEAN     NOT NULL DEFAULT false,
  voice_number        TEXT,
  voice_opted_in      BOOLEAN     NOT NULL DEFAULT false,
  notify_class_cancellation   BOOLEAN NOT NULL DEFAULT true,
  notify_payment_due          BOOLEAN NOT NULL DEFAULT true,
  notify_waiting_list         BOOLEAN NOT NULL DEFAULT true,
  notify_schedule_change      BOOLEAN NOT NULL DEFAULT true,
  notify_school_announcements BOOLEAN NOT NULL DEFAULT true,
  preferred_channel   TEXT        NOT NULL DEFAULT 'email'
                      CHECK (preferred_channel IN ('email', 'whatsapp', 'voice')),
  language            TEXT        NOT NULL DEFAULT 'he',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contact_owner CHECK (
    (person_id IS NOT NULL AND family_member_id IS NULL) OR
    (person_id IS NULL AND family_member_id IS NOT NULL)
  )
);

-- Indexes
CREATE INDEX idx_contact_person ON contact_preferences(person_id);
CREATE INDEX idx_contact_family_member ON contact_preferences(family_member_id);
CREATE INDEX idx_contact_tenant ON contact_preferences(tenant_id);

-- RLS
ALTER TABLE contact_preferences ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "super_admin manages all contact_preferences" ON contact_preferences FOR ALL
  USING (is_super_admin());

CREATE POLICY "admins manage preferences" ON contact_preferences FOR ALL
  USING (tenant_id = get_my_tenant_id() AND 'tenant_admin' = ANY(
    (SELECT role FROM user_profiles WHERE id = auth.uid())
  ));

-- Users can manage their own row (keyed by person_id or family_member_id)
CREATE POLICY "users manage own preferences" ON contact_preferences FOR ALL
  USING (
    person_id = get_my_person_id()
    OR family_member_id IN (
      SELECT id FROM family_members WHERE user_profile_id = auth.uid()
    )
  );