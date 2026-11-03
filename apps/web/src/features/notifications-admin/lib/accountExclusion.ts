/**
 * Why a hand-picked account would not receive an email, so the preview can say so
 * instead of "No one matches your current filters". These mirror what the
 * resolve_notification_blast_recipients RPC applies (no email, email or
 * announcements switched off) plus the marketing opt-in that send-notification
 * enforces for advertisements.
 */
export type AccountExclusion =
  | 'no_email'
  | 'email_opted_out'
  | 'announcements_off'
  | 'no_marketing_consent';

export interface AccountContactFacts {
  email: string | null | undefined;
  /** contact_preferences.email_opted_in; a missing row means opted in. */
  emailOptedIn: boolean | null | undefined;
  /** contact_preferences.notify_announcements; a missing row means on. */
  notifyAnnouncements: boolean | null | undefined;
  purpose: 'service' | 'marketing';
  /** Latest marketing_email consent is granted. */
  marketingGranted: boolean;
}

export function pickAccountExclusion(f: AccountContactFacts): AccountExclusion | null {
  if (!f.email || !f.email.trim()) return 'no_email';
  if (f.emailOptedIn === false) return 'email_opted_out';
  if (f.notifyAnnouncements === false) return 'announcements_off';
  if (f.purpose === 'marketing' && !f.marketingGranted) return 'no_marketing_consent';
  return null;
}
