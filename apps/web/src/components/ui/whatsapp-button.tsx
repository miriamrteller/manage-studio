import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { formatPhone, formatPhoneE164, isValidIsraeliPhone } from '@/utils/formatters';

export type WhatsAppButtonVariant = 'floating' | 'inline' | 'compact';

export interface WhatsAppButtonProps {
  /** Any Israeli or international form: "050-123-4567", "+972501234567", ... */
  phoneNumber: string;
  /** Pre-filled message. Hebrew is fine — it is percent-encoded. */
  message?: string;
  variant?: WhatsAppButtonVariant;
  /** Visible text for the inline variant. */
  label?: string;
  /** Fall back to an sms: link when the number is not WhatsApp-reachable. */
  smsFallback?: boolean;
  className?: string;
}

/** Inline SVG so no icon dependency is added and the mark is never mirrored. */
function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.347-.347.52-.52.174-.174.232-.298.347-.497.116-.198.058-.371-.016-.52-.075-.148-.669-1.611-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.247-.694.247-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
      <path d="M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.334.101 11.892c0 2.096.549 4.14 1.595 5.945L0 24l6.335-1.652a11.9 11.9 0 0 0 5.705 1.448h.006c6.585 0 11.946-5.336 11.949-11.896 0-3.176-1.24-6.165-3.495-8.411m-8.475 18.297h-.005a9.87 9.87 0 0 1-5.03-1.378l-.361-.214-3.741.98.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.002-5.45 4.437-9.884 9.888-9.884a9.82 9.82 0 0 1 6.988 2.898 9.82 9.82 0 0 1 2.892 6.994c-.003 5.45-4.437 9.886-9.884 9.886" />
    </svg>
  );
}

/**
 * whatsapp-button: click-to-chat launcher.
 *
 * Design system
 * - WhatsApp green comes from the `--color-whatsapp*` tokens added in
 *   index.css, not a hard-coded hex. Brand marks are deliberately excluded
 *   from tenant theming, so a school's palette can never recolour them into a
 *   guideline violation.
 * - Focus ring uses `--state-focus`-style tooling but is drawn in the brand
 *   green so it stays visible against the green fill.
 * - The floating variant sits on the `--z-floating` tier with the
 *   `--elevation-floating` shadow, and clears the mobile tab bar and the iOS
 *   home indicator.
 * - The glyph never mirrors in RTL (it is a logo, not a directional icon);
 *   only its inline position flips, which logical properties handle.
 *
 * Behaviour
 * - The number is normalised to E.164 via libphonenumber-js and sent to
 *   `https://wa.me/<digits>`, which resolves to the native app on mobile and
 *   WhatsApp Web on desktop — no unreliable user-agent sniffing.
 * - The message is percent-encoded, so Hebrew text survives intact.
 * - If the number is not a valid WhatsApp target, the component renders an
 *   `sms:` link instead (when `smsFallback` is on) rather than a dead link.
 *
 * Accessibility
 * - Rendered as a link with an accessible name that states the action, the
 *   formatted number and, when present, a preview of the message.
 * - 48px minimum touch target in every variant.
 * - `rel="noopener noreferrer"` on the new-tab link.
 */
export function WhatsAppButton({
  phoneNumber,
  message,
  variant = 'inline',
  label = 'WhatsApp',
  smsFallback = true,
  className = '',
}: WhatsAppButtonProps) {
  const { href, isWhatsApp, display } = useMemo(() => {
    const e164 = formatPhoneE164(phoneNumber);
    const digits = e164.replace(/\D/g, '');
    const readable = formatPhone(phoneNumber) || phoneNumber;
    const query = message ? `?text=${encodeURIComponent(message)}` : '';

    if (isValidIsraeliPhone(phoneNumber) && digits) {
      return { href: `https://wa.me/${digits}${query}`, isWhatsApp: true, display: readable };
    }

    if (smsFallback && digits) {
      const body = message ? `?body=${encodeURIComponent(message)}` : '';
      return { href: `sms:${e164 || `+${digits}`}${body}`, isWhatsApp: false, display: readable };
    }

    return { href: null as string | null, isWhatsApp: false, display: readable };
  }, [phoneNumber, message, smsFallback]);

  if (!href) return null;

  const accessibleName = [
    isWhatsApp ? `Contact ${display} on WhatsApp` : `Send an SMS to ${display}`,
    message ? `Message begins: ${message}` : null,
  ]
    .filter(Boolean)
    .join('. ');

  const base = cn(
    'touch-target gap-2 font-medium',
    'bg-[var(--color-whatsapp)] text-[var(--color-whatsapp-foreground)]',
    'hover:bg-[var(--color-whatsapp-hover)] active:bg-[var(--color-whatsapp-active)]',
    'motion-safe transition-colors duration-150',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
    'focus-visible:outline-[var(--color-whatsapp-active)]',
  );

  const variantClasses: Record<WhatsAppButtonVariant, string> = {
    // `end-4` / `bottom-*` are logical, so the button flips corner in RTL.
    floating: cn(
      'shadow-elevation-floating z-elevation-floating fixed end-4 rounded-full',
      'bottom-[calc(1rem+env(safe-area-inset-bottom,0px))]',
      'md:bottom-4',
    ),
    inline: 'rounded-md px-4 py-2 text-body-sm',
    compact: 'rounded-full',
  };

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={accessibleName}
      title={isWhatsApp ? `WhatsApp ${display}` : `SMS ${display}`}
      className={cn(base, variantClasses[variant], className)}
    >
      <WhatsAppGlyph className="h-5 w-5 flex-shrink-0" />
      {variant === 'inline' && <span>{label}</span>}
    </a>
  );
}

export default WhatsAppButton;
