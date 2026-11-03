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
export declare const SIGNER_DETAILS_VERSION = 1;
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
export type SignerDetailsErrorCode = 'confirm_required' | 'signer_name_required' | 'id_required' | 'id_invalid' | 'passport_invalid' | 'passport_country_required' | 'phone_invalid' | 'address_required' | 'child_name_required' | 'child_dob_required' | 'child_dob_invalid';
/** Field key → code. Keys are stable ids the form uses to focus the first problem. */
export type SignerDetailsErrors = Partial<Record<'confirmed' | 'signer.full_name' | 'signer.id_number' | 'signer.passport_country' | 'signer.phone' | 'signer.address' | 'child.full_name' | 'child.date_of_birth', SignerDetailsErrorCode>>;
/** Digits only, left-padded to 9. Returns null when it is not 5 to 9 digits. */
export declare function normaliseIsraeliId(raw: string): string | null;
/**
 * The Israeli ID check digit (the same rule as the Population Authority's): multiply the digits
 * alternately by 1 and 2, add the digits of each product, and the total must be divisible by 10.
 */
export declare function isValidIsraeliId(raw: string): boolean;
export declare function normalisePassport(raw: string): string;
/** A real calendar date in YYYY-MM-DD, not in the future and not before 1900. */
export declare function isValidBirthDate(value: string, today?: Date): boolean;
export type SignerDetailsValidation = {
    ok: true;
    value: Omit<SignerDetailsSnapshot, 'child'> & {
        child?: SignerChild;
    };
} | {
    ok: false;
    errors: SignerDetailsErrors;
};
/**
 * Checks what the browser sent and returns it cleaned up (trimmed, ID and passport normalised),
 * or the problems by field. `requireChild` is decided by the SERVER from the stored profile, never
 * from the form. A child block sent when it is not required is dropped.
 */
export declare function validateSignerDetails(input: unknown, options: {
    requireChild: boolean;
    today?: Date;
}): SignerDetailsValidation;
/** Adds the flag that records whether the submitted date of birth matches the one on file. */
export declare function sealSignerDetails(validated: Extract<SignerDetailsValidation, {
    ok: true;
}>['value'], profileDateOfBirth: string | null | undefined): SignerDetailsSnapshot;
/** "••••••123": everything but the last three characters hidden. For admin lists. */
export declare function maskIdNumber(idNumber: string | null | undefined): string;
/**
 * JSON with object keys sorted at EVERY level and no whitespace. The record_hmac input embeds the
 * signer details in this form, so the signer (accept-waiver) and the verifier rebuild it byte for
 * byte, whatever order Postgres or the browser hands the keys back in.
 */
export declare function canonicalJson(value: unknown): string;
//# sourceMappingURL=signerDetails.d.ts.map