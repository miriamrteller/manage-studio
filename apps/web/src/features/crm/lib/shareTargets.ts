/**
 * Where an enquiry link points, and the tagged links for each channel.
 *
 * Every share/QR/poster component takes a FormTarget, so the same pieces work
 * for the general form (/inquire) and, later, for named forms (/f/<slug>).
 */
export interface FormTarget {
  /** Path on the studio host: '/inquire' today, '/f/<slug>' for a named form. */
  path: string;
  /** Shown on the poster and share text when set (a named form's title). */
  title?: string | null;
}

export const DEFAULT_FORM: FormTarget = { path: '/inquire' };

/** Channels the "Get leads" panel offers, in display order. */
export const SHARE_CHANNELS = ['whatsapp', 'instagram', 'facebook', 'google', 'email', 'sms', 'flyer'] as const;
export type ShareChannel = (typeof SHARE_CHANNELS)[number];

/** The form's link, optionally tagged with the channel it was shared on (?src=). */
export function formLink(origin: string, target: FormTarget, src?: string | null): string {
  const url = new URL(target.path, origin);
  if (src) url.searchParams.set('src', src);
  return url.toString();
}

/**
 * A link that opens the channel's own composer with the form link filled in,
 * where the channel has one (WhatsApp, email, SMS). Others: null (copy only).
 */
export function composeHref(channel: ShareChannel, link: string, message: string): string | null {
  const text = `${message} ${link}`.trim();
  switch (channel) {
    case 'whatsapp':
      return `https://wa.me/?text=${encodeURIComponent(text)}`;
    case 'email':
      return `mailto:?subject=${encodeURIComponent(message)}&body=${encodeURIComponent(text)}`;
    case 'sms':
      return `sms:?&body=${encodeURIComponent(text)}`;
    default:
      return null;
  }
}

/** Safe file name part from a studio name ("Creative Ballet" → "creative-ballet"). */
export function fileSlug(name: string | null | undefined): string {
  const slug = (name ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'enquiry-form';
}
