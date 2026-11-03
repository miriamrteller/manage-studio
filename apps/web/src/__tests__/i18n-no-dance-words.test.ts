/**
 * Owner rule: dance-specific words appear only for dance studios. The base wording (what every
 * class business that is not a dance studio sees) must have none: no ballet, recital, leotard,
 * pointe or tutu. The dance studio TYPE name ("Dance studio") and the dance overlay are the
 * only places "dance" belongs, and neither is checked here.
 * Run: pnpm -C apps/web test i18n-no-dance-words.test.ts
 */
import { describe, expect, it } from 'vitest';
import en from '@/i18n/en.json';
import he from '@/i18n/he.json';

const DANCE_WORDS = /\b(ballet|recitals?|leotards?|pointe|tutus?)\b|בלט|רסיטל/i;

function offenders(node: unknown, path = ''): string[] {
  if (typeof node === 'string') return DANCE_WORDS.test(node) ? [`${path}: ${node.slice(0, 80)}`] : [];
  if (Array.isArray(node)) return node.flatMap((v, i) => offenders(v, `${path}[${i}]`));
  if (node && typeof node === 'object') {
    return Object.entries(node).flatMap(([k, v]) => offenders(v, path ? `${path}.${k}` : k));
  }
  return [];
}

describe('base wording has no dance-only words', () => {
  it('English', () => {
    expect(offenders(en)).toEqual([]);
  });
  it('Hebrew', () => {
    expect(offenders(he)).toEqual([]);
  });
});
