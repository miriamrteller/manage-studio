-- Migration 008 — Notification log
-- Unified audit trail for all notification channels (email, whatsapp, voice)

CREATE TABLE notification_log (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        NOT NULL REFERENCES tenants(id),

  -- Recipient (one of person_id or family_member_id, never both)
  recipient_person_id        UUID REFERENCES people(id),
  recipient_family_member_id UUID REFERENCES family_members(id),
  recipient_email  TEXT,              -- denormalized for audit trail
  recipient_phone  TEXT,              -- E.164 format: +972501234567

  -- What was sent
  channel          TEXT        NOT NULL DEFAULT 'email'
                   CHECK (channel IN ('email','whatsapp','voice')),
  template_name    TEXT        NOT NULL,
  -- Examples: 'welcome', 'class_cancellation', 'payment_reminder', 'waiting_list_offer'

  -- Template variables used (JSONB for audit trail, allows resend)
  variables        JSONB,              -- { "school_name": "...", "student_name": "...", ... }

  -- Rendered content
  subject          TEXT,               -- email subject or voice script summary
  body_preview     TEXT,               -- first 500 chars of rendered message

  -- Delivery tracking
  external_msg_id  TEXT,               -- Resend message ID, Twilio SID, etc.
  status           TEXT        NOT NULL DEFAULT 'sent'
                   CHECK (status IN ('sent','delivered','read','failed','bounced','pending')),
  failure_reason   TEXT,               -- If status = failed: error message

  -- Metadata
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at          TIMESTAMPTZ,

  -- Constraint: at least one recipient identifier must be present
  CONSTRAINT recipient_not_null CHECK (
    (recipient_person_id IS NOT NULL)::int +
    (recipient_family_member_id IS NOT NULL)::int +
    (recipient_email IS NOT NULL)::int +
    (recipient_phone IS NOT NULL)::int > 0
  )
);

-- Indexes for common queries
CREATE INDEX idx_notification_log_tenant     ON notification_log(tenant_id);
CREATE INDEX idx_notification_log_person     ON notification_log(recipient_person_id);
CREATE INDEX idx_notification_log_family     ON notification_log(recipient_family_member_id);
CREATE INDEX idx_notification_log_status     ON notification_log(status);
CREATE INDEX idx_notification_log_channel    ON notification_log(channel);
CREATE INDEX idx_notification_log_created    ON notification_log(tenant_id, created_at DESC);

-- Row level security
ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

-- Admins + super_admins can see/insert all notifications for their tenant
CREATE POLICY notification_log_access ON notification_log
  FOR SELECT
  USING (
    is_super_admin()
    OR tenant_id = get_my_tenant_id()
  );

CREATE POLICY notification_log_insert ON notification_log
  FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR tenant_id = get_my_tenant_id()
  );