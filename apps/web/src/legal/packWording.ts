/**
 * Plain names for what a studio's clients sign, by studio type, and the
 * "your documents are still drafts" sentence shown until the legal pack is confirmed.
 */
export type SignedDocNoun = 'health' | 'contract' | 'agreement';

export function signedDocNoun(vertical: string | null | undefined): SignedDocNoun {
  if (vertical === 'dance-studio') return 'health';
  if (vertical === 'photographer' || vertical === 'beautician') return 'contract';
  return 'agreement';
}

/** i18n key of the "still drafts, clients can still book, sign and pay" sentence. */
export function legalBlockedKey(vertical: string | null | undefined): string {
  return vertical === 'dance-studio' ? 'legal.pack.blocked_parents' : 'legal.pack.blocked_clients';
}
