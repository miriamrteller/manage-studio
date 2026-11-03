/**
 * Signer details sealed on every signed waiver, health declaration and contract.
 *
 * Who signed, and for whom, is part of the evidence: the signer's full name, ID number (or
 * passport number and country), phone and address, plus the child's name and date of birth when
 * the form is for a minor, and the signer's tick "These details are correct". The exact submitted
 * values are stored on the signed record (waiver_evidence.signer_details) and are part of the
 * record_hmac input.
 *
 * Pure and dependency-free: the browser form, the accept-waiver Edge Function (via the email-dist
 * bundle) and the tests all run these same rules. The database repeats the structural checks and
 * the ID check digit (is_valid_israeli_id, sign_waiver), so a direct call cannot skip them.
 *
 * The ID number is sensitive: it lives only in the signed snapshot. Never log it.
 */

import { isValidIsraeliId } from './legal/personalIdentity.js';

export const SIGNER_DETAILS_VERSION = 1;

export type SignerIdType = 'israeli_id' | 'passport';

export interface SignerPerson {
  full_name: string;
  id_type: SignerIdType;
  /** Israeli ID: 9 digits with leading zeros. Passport: letters and digits, upper case. */
  id_number: string;
  /** Required when id_type is 'passport' (issuing country). */
  passport_country?: string;
  phone: string;
  address: string;
}

export interface SignerChild {
  full_name: string;
  /** YYYY-MM-DD */
  date_of_birth: string;
}

/** What the browser sends. */
export interface SignerDetailsInput {
  signer: SignerPerson;
  /** Only used when the form is for a minor. */
  child?: SignerChild;
  /** The "These details are correct" tick. */
  confirmed: boolean;
  /** The exact wording of that tick as the signer saw it (so the record shows what they agreed to). */
  confirmed_wording: string;
}

/** What is stored and sealed. */
export interface SignerDetailsSnapshot {
  version: typeof SIGNER_DETAILS_VERSION;
  confirmed: true;
  confirmed_wording: string;
  signer: SignerPerson;
  child?: SignerChild & {
    /** True when the date of birth the signer submitted differs from the one on file. */
    dob_differs_from_profile: boolean;
  };
}

/** Error codes (not text): the form turns them into translated messages. */
export type SignerDetailsErrorCode =
  | 'confirm_required'
  | 'signer_name_required'
  | 'id_required'
  | 'id_invalid'
  | 'passport_invalid'
  | 'passport_country_required'
  | 'phone_invalid'
  | 'address_required'
  | 'child_name_required'
  | 'child_dob_required'
  | 'child_dob_invalid';

/** Field key → code. Keys are stable ids the form uses to focus the first problem. */
export type SignerDetailsErrors = Partial<Record<
  | 'confirmed'
  | 'signer.full_name'
  | 'signer.id_number'
  | 'signer.passport_country'
  | 'signer.phone'
  | 'signer.address'
  | 'child.full_name'
  | 'child.date_of_birth',
  SignerDetailsErrorCode
>>;

// ── Israeli ID ────────────────────────────────────────────────────────────────

/** Digits only, left-padded to 9. Returns null when it is not 5 to 9 digits. */
export function normaliseIsraeliId(raw: string): string | null {
  const digits = (raw ?? '').replace(/[\s-]/g, '');
  if (!/^\d{5,9}$/.test(digits)) return null;
  return digits.padStart(9, '0');
}

// The Israeli ID check digit lives in ./legal/personalIdentity.ts (one shared validator).

const PASSPORT_PATTERN = /^[A-Z0-9]{5,20}$/;
const PHONE_CHARS = /^[0-9+\-()\s.]{7,25}$/;

export function normalisePassport(raw: string): string {
  return (raw ?? '').replace(/[\s-]/g, '').toUpperCase();
}

function phoneDigits(raw: string): number {
  return (raw ?? '').replace(/\D/g, '').length;
}

/** A real calendar date in YYYY-MM-DD, not in the future and not before 1900. */
export function isValidBirthDate(value: string, today: Date = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return false;
  if (y < 1900) return false;
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return date.getTime() <= todayUtc;
}

// ── Validation ────────────────────────────────────────────────────────────────

export type SignerDetailsValidation =
  | { ok: true; value: Omit<SignerDetailsSnapshot, 'child'> & { child?: SignerChild } }
  | { ok: false; errors: SignerDetailsErrors };

/**
 * Checks what the browser sent and returns it cleaned up (trimmed, ID and passport normalised),
 * or the problems by field. `requireChild` is decided by the SERVER from the stored profile, never
 * from the form. A child block sent when it is not required is dropped.
 */
export function validateSignerDetails(
  input: unknown,
  options: { requireChild: boolean; today?: Date },
): SignerDetailsValidation {
  const errors: SignerDetailsErrors = {};
  const src = (input && typeof input === 'object' ? input : {}) as Partial<SignerDetailsInput>;
  const signerIn = (src.signer && typeof src.signer === 'object' ? src.signer : {}) as Partial<SignerPerson>;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

  if (src.confirmed !== true) errors.confirmed = 'confirm_required';

  const fullName = str(signerIn.full_name);
  if (fullName.length < 2 || fullName.length > 120) errors['signer.full_name'] = 'signer_name_required';

  const idType: SignerIdType = signerIn.id_type === 'passport' ? 'passport' : 'israeli_id';
  let idNumber = '';
  let passportCountry: string | undefined;
  if (idType === 'israeli_id') {
    const raw = str(signerIn.id_number);
    if (!raw) errors['signer.id_number'] = 'id_required';
    else if (!isValidIsraeliId(raw)) errors['signer.id_number'] = 'id_invalid';
    else idNumber = normaliseIsraeliId(raw) as string;
  } else {
    const raw = normalisePassport(str(signerIn.id_number));
    if (!raw) errors['signer.id_number'] = 'id_required';
    else if (!PASSPORT_PATTERN.test(raw)) errors['signer.id_number'] = 'passport_invalid';
    else idNumber = raw;
    const country = str(signerIn.passport_country);
    if (country.length < 2 || country.length > 60) errors['signer.passport_country'] = 'passport_country_required';
    else passportCountry = country;
  }

  const phone = str(signerIn.phone);
  if (!PHONE_CHARS.test(phone) || phoneDigits(phone) < 7 || phoneDigits(phone) > 15) {
    errors['signer.phone'] = 'phone_invalid';
  }

  const address = str(signerIn.address);
  if (address.length < 5 || address.length > 300) errors['signer.address'] = 'address_required';

  let child: SignerChild | undefined;
  if (options.requireChild) {
    const childIn = (src.child && typeof src.child === 'object' ? src.child : {}) as Partial<SignerChild>;
    const childName = str(childIn.full_name);
    if (childName.length < 2 || childName.length > 120) errors['child.full_name'] = 'child_name_required';
    const dob = str(childIn.date_of_birth);
    if (!dob) errors['child.date_of_birth'] = 'child_dob_required';
    else if (!isValidBirthDate(dob, options.today)) errors['child.date_of_birth'] = 'child_dob_invalid';
    child = { full_name: childName, date_of_birth: dob };
  }

  const wording = str(src.confirmed_wording);
  if (src.confirmed === true && (wording.length < 1 || wording.length > 500)) {
    errors.confirmed = 'confirm_required';
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const signer: SignerPerson = {
    full_name: fullName,
    id_type: idType,
    id_number: idNumber,
    ...(passportCountry ? { passport_country: passportCountry } : {}),
    phone,
    address,
  };
  return {
    ok: true,
    value: {
      version: SIGNER_DETAILS_VERSION,
      confirmed: true,
      confirmed_wording: wording,
      signer,
      ...(child ? { child } : {}),
    },
  };
}

/** Adds the flag that records whether the submitted date of birth matches the one on file. */
export function sealSignerDetails(
  validated: Extract<SignerDetailsValidation, { ok: true }>['value'],
  profileDateOfBirth: string | null | undefined,
): SignerDetailsSnapshot {
  const { child, ...rest } = validated;
  return {
    ...rest,
    ...(child
      ? {
          child: {
            ...child,
            dob_differs_from_profile: Boolean(profileDateOfBirth) && String(profileDateOfBirth).slice(0, 10) !== child.date_of_birth,
          },
        }
      : {}),
  };
}

// ── Display and sealing helpers ───────────────────────────────────────────────

/** "••••••123": everything but the last three characters hidden. For admin lists. */
export function maskIdNumber(idNumber: string | null | undefined): string {
  const id = (idNumber ?? '').trim();
  if (!id) return '';
  const keep = id.length > 3 ? 3 : 0;
  return '•'.repeat(Math.max(id.length - keep, 3)) + (keep ? id.slice(-keep) : '');
}

/**
 * JSON with object keys sorted at EVERY level and no whitespace. The record_hmac input embeds the
 * signer details in this form, so the signer (accept-waiver) and the verifier rebuild it byte for
 * byte, whatever order Postgres or the browser hands the keys back in.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, sortDeep(v)]),
    );
  }
  return value;
}
