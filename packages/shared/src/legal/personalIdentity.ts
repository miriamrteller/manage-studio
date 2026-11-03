/**
 * The identity of a studio run by an individual who is not yet a registered
 * business (legal_profile.business_status = 'not_registered'): an Israeli ID
 * number (ת.ז.), or, for someone without one, a passport number and country.
 * The legal documents print it in place of a business number.
 * Keys: personal_id, no_israeli_id ('yes'), passport_number, passport_country.
 */

/** Israeli ID (ת.ז.) check digit: up to 9 digits, zero-padded, Luhn-style weights 1,2,1,2… */
export function isValidIsraeliId(value: string | null | undefined): boolean {
  const digits = (value ?? '').replace(/[\s-]/g, '');
  if (!/^\d{5,9}$/.test(digits)) return false;
  const id = digits.padStart(9, '0');
  if (id === '000000000') return false;
  let sum = 0;
  for (let i = 0; i < 9; i += 1) {
    let n = Number(id[i]) * ((i % 2) + 1);
    if (n > 9) n -= 9;
    sum += n;
  }
  return sum % 10 === 0;
}

export type PersonalIdentity =
  | { kind: 'israeli_id'; number: string }
  | { kind: 'passport'; number: string; country: string };

const clean = (v: string | undefined) => (v ?? '').trim();

/** The person's identity from the legal profile, or null when it is missing or invalid. */
export function personalIdentity(profile: Record<string, string | undefined>): PersonalIdentity | null {
  if (clean(profile.no_israeli_id) === 'yes') {
    const number = clean(profile.passport_number);
    const country = clean(profile.passport_country);
    return number && country ? { kind: 'passport', number, country } : null;
  }
  const id = clean(profile.personal_id).replace(/[\s-]/g, '');
  return isValidIsraeliId(id) ? { kind: 'israeli_id', number: id.padStart(9, '0') } : null;
}

/** "ID 123456782" / "ת"ז 123456782", or "passport X1234567, France" / "דרכון X1234567, France". */
export function personalIdentityText(identity: PersonalIdentity, lang: 'en' | 'he'): string {
  if (identity.kind === 'israeli_id') return lang === 'he' ? `ת"ז ${identity.number}` : `ID ${identity.number}`;
  return lang === 'he'
    ? `דרכון ${identity.number}, ${identity.country}`
    : `passport ${identity.number}, ${identity.country}`;
}
