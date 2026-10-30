/** Public link for a quote on the tenant's own site (the admin is already on it). */
export function quotePublicUrl(token: string, origin: string = window.location.origin): string {
  return `${origin}/quote/${token}`;
}

/** Israeli-friendly wa.me number: 05x → 9725x, strips +, spaces, dashes. */
export function whatsAppNumber(phone: string): string | null {
  let digits = phone.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('0')) digits = `972${digits.slice(1)}`;
  return /^\d{8,15}$/.test(digits) ? digits : null;
}

/**
 * WhatsApp share link with the quote URL prefilled. The studio's own WhatsApp
 * opens, so no template approval is needed (send-notification's WhatsApp path
 * requires a Twilio template SID and cannot carry the link yet).
 */
export function quoteWhatsAppUrl(phone: string | null, message: string): string {
  const number = phone ? whatsAppNumber(phone) : null;
  const text = encodeURIComponent(message);
  return number ? `https://wa.me/${number}?text=${text}` : `https://wa.me/?text=${text}`;
}
