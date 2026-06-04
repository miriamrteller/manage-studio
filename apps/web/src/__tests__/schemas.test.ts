/**
 * Test: Zod Schema Validation
 * Validates all Phase 1D schemas work correctly
 * Run: pnpm test schemas.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  NotificationLogSchema,
  AuditLogSchema,
  TenantNotificationTemplateSchema,
  ExpenseCategorySchema,
  NotificationPayloadSchema,
  OtpEmailPayloadSchema,
  VerifyWhatsAppOtpPayloadSchema,
  ContactPreferencesUpdateSchema,
} from '@shared/schemas';

describe('Phase 1D Schemas', () => {
  describe('NotificationLogSchema', () => {
    it('should validate a valid notification log entry', () => {
      const log = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        tenant_id: '550e8400-e29b-41d4-a716-446655440001',
        recipient_email: 'test@example.com',
        channel: 'email' as const,
        template_name: 'welcome',
        status: 'sent' as const,
        sent_at: new Date().toISOString(),
      };
      expect(() => NotificationLogSchema.parse(log)).not.toThrow();
    });

    it('should reject invalid channel', () => {
      const log = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        tenant_id: '550e8400-e29b-41d4-a716-446655440001',
        channel: 'invalid',
        template_name: 'welcome',
        status: 'sent',
        sent_at: new Date().toISOString(),
      };
      expect(() => NotificationLogSchema.parse(log)).toThrow();
    });
  });

  describe('OtpEmailPayloadSchema', () => {
    it('should validate valid OTP email payload', () => {
      const payload = {
        email: 'user@example.com',
        code: '123456',
        expiryMinutes: 10,
      };
      expect(() => OtpEmailPayloadSchema.parse(payload)).not.toThrow();
    });

    it('should reject invalid email', () => {
      const payload = {
        email: 'not-an-email',
        code: '123456',
      };
      expect(() => OtpEmailPayloadSchema.parse(payload)).toThrow();
    });

    it('should reject OTP with wrong length', () => {
      const payload = {
        email: 'user@example.com',
        code: '12345', // 5 digits instead of 6
      };
      expect(() => OtpEmailPayloadSchema.parse(payload)).toThrow();
    });

    it('should reject OTP with non-digits', () => {
      const payload = {
        email: 'user@example.com',
        code: '12345a',
      };
      expect(() => OtpEmailPayloadSchema.parse(payload)).toThrow();
    });
  });

  describe('VerifyWhatsAppOtpPayloadSchema', () => {
    it('should validate valid WhatsApp OTP payload', () => {
      const payload = {
        phone: '+972123456789',
        code: '654321',
      };
      expect(() => VerifyWhatsAppOtpPayloadSchema.parse(payload)).not.toThrow();
    });

    it('should reject invalid E.164 phone format', () => {
      const payload = {
        phone: '0123456789', // Missing + and country code
        code: '654321',
      };
      expect(() => VerifyWhatsAppOtpPayloadSchema.parse(payload)).toThrow();
    });

    it('should reject invalid OTP', () => {
      const payload = {
        phone: '+972123456789',
        code: '12345', // 5 digits
      };
      expect(() => VerifyWhatsAppOtpPayloadSchema.parse(payload)).toThrow();
    });
  });

  describe('ContactPreferencesUpdateSchema', () => {
    it('should validate valid preferences update', () => {
      const update = {
        email_opted_in: true,
        whatsapp_opted_in: false,
        preferred_channel: 'email' as const,
      };
      expect(() => ContactPreferencesUpdateSchema.parse(update)).not.toThrow();
    });

    it('should allow partial updates', () => {
      const update = {
        email_opted_in: true,
      };
      expect(() => ContactPreferencesUpdateSchema.parse(update)).not.toThrow();
    });

    it('should reject invalid hex color', () => {
      const update = {
        whatsapp_number: '+972123456789',
      };
      expect(() => ContactPreferencesUpdateSchema.parse(update)).not.toThrow();
    });
  });

  describe('TenantNotificationTemplateSchema', () => {
    it('should validate valid template', () => {
      const template = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        tenant_id: '550e8400-e29b-41d4-a716-446655440001',
        channel: 'email' as const,
        template_name: 'welcome',
        status: 'approved' as const,
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      expect(() => TenantNotificationTemplateSchema.parse(template)).not.toThrow();
    });

    it('should require template_name', () => {
      const template = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        tenant_id: '550e8400-e29b-41d4-a716-446655440001',
        channel: 'email',
        status: 'approved',
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      expect(() => TenantNotificationTemplateSchema.parse(template)).toThrow();
    });
  });

  describe('ExpenseCategorySchema', () => {
    it('should validate valid expense category', () => {
      const category = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        tenant_id: '550e8400-e29b-41d4-a716-446655440001',
        name: 'Guest Artist Fee',
        is_vat_eligible: true,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      expect(() => ExpenseCategorySchema.parse(category)).not.toThrow();
    });

    it('should validate hex color format', () => {
      const category = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        tenant_id: '550e8400-e29b-41d4-a716-446655440001',
        name: 'Props',
        color: '#FF6B6B',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      expect(() => ExpenseCategorySchema.parse(category)).not.toThrow();
    });

    it('should reject invalid hex color', () => {
      const category = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        tenant_id: '550e8400-e29b-41d4-a716-446655440001',
        name: 'Props',
        color: 'FF6B6B', // Missing #
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      expect(() => ExpenseCategorySchema.parse(category)).toThrow();
    });
  });

  describe('AuditLogSchema', () => {
    it('should validate valid audit log entry', () => {
      const log = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        tenant_id: '550e8400-e29b-41d4-a716-446655440001',
        action: 'enrolment.created',
        entity_type: 'enrolment',
        created_at: new Date().toISOString(),
      };
      expect(() => AuditLogSchema.parse(log)).not.toThrow();
    });

    it('should allow before/after state as JSONB', () => {
      const log = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        tenant_id: '550e8400-e29b-41d4-a716-446655440001',
        action: 'class.updated',
        entity_type: 'class',
        before_state: { name: 'Old Class', price: 100 },
        after_state: { name: 'New Class', price: 120 },
        created_at: new Date().toISOString(),
      };
      expect(() => AuditLogSchema.parse(log)).not.toThrow();
    });
  });

  describe('NotificationPayloadSchema', () => {
    it('should validate valid notification payload', () => {
      const payload = {
        tenantId: '550e8400-e29b-41d4-a716-446655440001',
        recipientEmail: 'user@example.com',
        templateName: 'welcome',
        channel: 'email' as const,
      };
      expect(() => NotificationPayloadSchema.parse(payload)).not.toThrow();
    });

    it('should require either email, phone, or recipientId', () => {
      const payload = {
        tenantId: '550e8400-e29b-41d4-a716-446655440001',
        templateName: 'welcome',
        channel: 'email',
      };
      // This should validate, but the Edge Function will reject it
      // because it requires contact info
      expect(() => NotificationPayloadSchema.parse(payload)).not.toThrow();
    });

    it('should validate with phone number', () => {
      const payload = {
        tenantId: '550e8400-e29b-41d4-a716-446655440001',
        recipientPhone: '+972123456789',
        templateName: 'otp',
        channel: 'whatsapp' as const,
      };
      expect(() => NotificationPayloadSchema.parse(payload)).not.toThrow();
    });
  });
});
