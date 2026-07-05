import { describe, it, expect } from 'vitest';
import type { NotificationLog } from '@shared/schemas';
import {
  isNotificationBodyRedacted,
  resolveNotificationLogBody,
  resolveNotificationLogSubject,
} from '@/features/notifications/lib/notificationLogDetail';

const baseLog: NotificationLog = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  tenant_id: '550e8400-e29b-41d4-a716-446655440001',
  channel: 'email',
  template_name: 'admin_announcement',
  status: 'sent',
};

describe('notificationLogDetail', () => {
  describe('resolveNotificationLogSubject', () => {
    it('prefers log.subject over variables', () => {
      const log: NotificationLog = {
        ...baseLog,
        subject: ' Stored subject ',
        variables: { subject: 'Variable subject' },
      };
      expect(resolveNotificationLogSubject(log)).toBe('Stored subject');
    });

    it('falls back to variables.subject', () => {
      const log: NotificationLog = {
        ...baseLog,
        variables: { subject: '  Blast subject  ' },
      };
      expect(resolveNotificationLogSubject(log)).toBe('Blast subject');
    });

    it('returns null when no subject is stored', () => {
      expect(resolveNotificationLogSubject(baseLog)).toBeNull();
    });
  });

  describe('resolveNotificationLogBody', () => {
    it('returns full body from variables for admin announcements', () => {
      const log: NotificationLog = {
        ...baseLog,
        variables: { subject: 'Hi', body: 'Full announcement body' },
      };
      expect(resolveNotificationLogBody(log)).toBe('Full announcement body');
    });

    it('falls back to body_preview', () => {
      const log: NotificationLog = {
        ...baseLog,
        body_preview: 'Preview text…',
      };
      expect(resolveNotificationLogBody(log)).toBe('Preview text…');
    });

    it('redacts otp_code templates', () => {
      const log: NotificationLog = {
        ...baseLog,
        template_name: 'otp_code',
        variables: { code: '123456', body: 'secret' },
        body_preview: '123456',
      };
      expect(isNotificationBodyRedacted(log.template_name)).toBe(true);
      expect(resolveNotificationLogBody(log)).toBeNull();
    });

    it('returns null when no body is stored', () => {
      expect(resolveNotificationLogBody(baseLog)).toBeNull();
    });
  });
});
