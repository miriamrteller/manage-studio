/**
 * Tests for the pure lead-email parser behind crm-lead-ingest (phase 2b).
 * Guards the null-honesty rules: fields we cannot source from the email are
 * null, never guessed — and the admin's pinned `note` is never auto-filled
 * (the parser doesn't even emit one).
 */
import { describe, expect, it } from 'vitest';

import {
  bodySnippet,
  cleanSubject,
  extractPhone,
  parseLeadEmail,
} from '../../../../supabase/functions/_shared/crm-contract/parse-lead-email.ts';

describe('parseLeadEmail', () => {
  it('extracts a full English inquiry', () => {
    const parsed = parseLeadEmail({
      fromName: 'Rivka Levy',
      fromEmail: 'Rivka.Levy@Gmail.com',
      subject: 'Re: Birthday party for my daughter',
      text: 'Hi! Do you host parties for 6-year-olds?\nYou can reach me at 052-123 45 67.\nThanks, Rivka',
    });
    expect(parsed).toEqual({
      name: 'Rivka Levy',
      email: 'rivka.levy@gmail.com',
      phone: '0521234567',
      interest: 'Birthday party for my daughter',
      lastCommunicationNote:
        'Hi! Do you host parties for 6-year-olds? You can reach me at 052-123 45 67. Thanks, Rivka',
    });
  });

  it('handles a Hebrew inquiry with a +972 number and Hebrew reply prefix', () => {
    const parsed = parseLeadEmail({
      fromName: 'נועה ברק',
      fromEmail: 'noa@example.com',
      subject: 'השב: חוג בלט לגיל 3',
      text: 'שלום, אשמח לפרטים על חוג לפעוטות. אפשר לחזור אליי בטלפון +972-52-765 43 21',
    });
    expect(parsed.name).toBe('נועה ברק');
    expect(parsed.interest).toBe('חוג בלט לגיל 3');
    expect(parsed.phone).toBe('+972527654321');
  });

  it('falls back to the email local part for the name, never fabricates', () => {
    const parsed = parseLeadEmail({
      fromName: null,
      fromEmail: 'dafna.katz@example.com',
      subject: null,
      text: null,
    });
    expect(parsed).toEqual({
      name: 'dafna.katz',
      email: 'dafna.katz@example.com',
      phone: null,
      interest: null,
      lastCommunicationNote: null,
    });
  });

  it('survives a completely empty message', () => {
    const parsed = parseLeadEmail({ fromName: null, fromEmail: null, subject: null, text: null });
    expect(parsed.name).toBe('Unknown enquirer');
    expect(parsed.email).toBeNull();
  });
});

describe('cleanSubject', () => {
  it('strips stacked Re:/Fwd: prefixes case-insensitively', () => {
    expect(cleanSubject('RE: fwd: Re:  Party inquiry ')).toBe('Party inquiry');
  });
  it('returns null for empty or prefix-only subjects', () => {
    expect(cleanSubject('  ')).toBeNull();
    expect(cleanSubject('Re: ')).toBeNull();
    expect(cleanSubject(null)).toBeNull();
  });
});

describe('bodySnippet', () => {
  it('drops quoted history and signature blocks', () => {
    const text = [
      'Great, Tuesday works for us!',
      '',
      'On Mon, Aug 17, 2026 at 9:00 AM Studio Aviv wrote:',
      '> We have openings on Tuesday and Thursday.',
      '> Which suits you?',
    ].join('\n');
    expect(bodySnippet(text)).toBe('Great, Tuesday works for us!');
  });

  it('caps very long bodies with an ellipsis', () => {
    const snippet = bodySnippet('word '.repeat(200));
    expect(snippet!.length).toBeLessThanOrEqual(300);
    expect(snippet!.endsWith('…')).toBe(true);
  });
});

describe('extractPhone', () => {
  it.each([
    ['call 054-842-19-87 anytime', '0548421987'],
    ['my number is +972 52 123 45 67', '+972521234567'],
    ['landline 03-624 88 11', '036248811'],
  ])('finds %s', (text, expected) => {
    expect(extractPhone(text)).toBe(expected);
  });

  it('returns null rather than guessing', () => {
    expect(extractPhone('no digits here')).toBeNull();
    expect(extractPhone(null)).toBeNull();
  });
});
