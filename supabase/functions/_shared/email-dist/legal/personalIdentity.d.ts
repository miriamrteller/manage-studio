/**
 * The identity of a studio run by an individual who is not yet a registered
 * business (legal_profile.business_status = 'not_registered'): an Israeli ID
 * number (ת.ז.), or, for someone without one, a passport number and country.
 * The legal documents print it in place of a business number.
 * Keys: personal_id, no_israeli_id ('yes'), passport_number, passport_country.
 */
/** Israeli ID (ת.ז.) check digit: up to 9 digits, zero-padded, Luhn-style weights 1,2,1,2… */
export declare function isValidIsraeliId(value: string | null | undefined): boolean;
export type PersonalIdentity = {
    kind: 'israeli_id';
    number: string;
} | {
    kind: 'passport';
    number: string;
    country: string;
};
/** The person's identity from the legal profile, or null when it is missing or invalid. */
export declare function personalIdentity(profile: Record<string, string | undefined>): PersonalIdentity | null;
/** "ID 123456782" / "ת"ז 123456782", or "passport X1234567, France" / "דרכון X1234567, France". */
export declare function personalIdentityText(identity: PersonalIdentity, lang: 'en' | 'he'): string;
//# sourceMappingURL=personalIdentity.d.ts.map