import type { NotificationLog } from '@shared/schemas';

const REDACTED_TEMPLATES = new Set(['otp_code']);

export const NOTIFICATION_LOG_STATUS_BADGE_CLASSES: Record<string, string> = {
  sent: 'bg-green-100 text-green-800',
  delivered: 'bg-green-100 text-green-800',
  read: 'bg-blue-100 text-blue-800',
  pending: 'bg-yellow-100 text-yellow-800',
  failed: 'bg-red-100 text-red-800',
  bounced: 'bg-red-100 text-red-800',
};

export function isNotificationBodyRedacted(templateName: string): boolean {
  return REDACTED_TEMPLATES.has(templateName);
}

export function resolveNotificationLogSubject(log: NotificationLog): string | null {
  if (log.subject?.trim()) return log.subject.trim();
  const v = log.variables?.subject;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export function resolveNotificationLogBody(log: NotificationLog): string | null {
  if (isNotificationBodyRedacted(log.template_name)) return null;
  const bodyVar = log.variables?.body;
  if (typeof bodyVar === 'string' && bodyVar.trim()) return bodyVar;
  if (log.body_preview?.trim()) return log.body_preview.trim();
  return null;
}

export function formatNotificationLogSentAt(log: NotificationLog): string | null {
  const at = log.sent_at ?? log.created_at;
  return at ? new Date(at).toLocaleString() : null;
}

export function formatNotificationLogRecipient(log: NotificationLog): string | null {
  return log.recipient_email ?? log.recipient_phone ?? null;
}
