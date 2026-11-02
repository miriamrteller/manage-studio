/**
 * Plain names for what a studio's clients sign, by studio type, and the
 * "can't sign up yet" sentence shown until the legal pack is confirmed.
 */
export type SignedDocNoun = 'health' | 'contract' | 'agreement';

export function signedDocNoun(vertical: string | null | undefined): SignedDocNoun {
  if (vertical === 'dance-studio') return 'health';
  if (vertical === 'photographer' || vertical === 'beautician') return 'contract';
  return 'agreement';
}

/** i18n key of the sentence that says who is blocked until the pack is confirmed. */
export function legalBlockedKey(vertical: string | null | undefined): string {
  return vertical === 'dance-studio' ? 'legal.pack.blocked_parents' : 'legal.pack.blocked_clients';
}
