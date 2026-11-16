/**
 * Thank-you email to new website sign-ups (tenants.lead_thank_you): off unless
 * switched on, sent in the visitor's language (falling back to the other side
 * when one is empty), {name} -> first name, {studio} -> studio name; the
 * settings card always shows full ready-made wording, never blanks.
 * Run: pnpm -C apps/web test lead-thank-you
 */
import { describe, expect, it } from 'vitest';
import {
  buildLeadThankYou,
  parseLeadThankYou,
} from '../../../../supabase/functions/_shared/crm-contract/lead-thank-you.ts';
import { withThankYouDefaults } from '@/features/settings/components/LeadThankYouSetting';

const on = parseLeadThankYou({
  enabled: true,
  subject_en: 'Thanks from {studio}',
  body_en: 'Hi {name},\n\nSee you soon!',
  subject_he: 'תודה מ-{studio}',
  body_he: 'שלום {name},\n\nנתראה!',
});

describe('buildLeadThankYou', () => {
  it('is off by default and for anything but enabled: true', () => {
    expect(buildLeadThankYou(parseLeadThankYou(null), 'en', { name: 'Dana', studio: 'S' })).toBeNull();
    expect(buildLeadThankYou(parseLeadThankYou({ ...on, enabled: 'yes' }), 'en', { name: 'Dana', studio: 'S' })).toBeNull();
  });

  it('fills the first name and the studio, in the visitor language', () => {
    expect(buildLeadThankYou(on, 'en', { name: 'Dana Levi', studio: 'Creative Ballet' })).toEqual({
      subject: 'Thanks from Creative Ballet',
      body: 'Hi Dana,\n\nSee you soon!',
      language: 'en',
    });
    expect(buildLeadThankYou(on, 'he', { name: 'דנה לוי', studio: 'רוקדות' })?.body).toBe('שלום דנה,\n\nנתראה!');
  });

  it('falls back to the other language when one side is empty', () => {
    const enOnly = parseLeadThankYou({ ...on, subject_he: '', body_he: '' });
    expect(buildLeadThankYou(enOnly, 'he', { name: 'Dana', studio: 'S' })?.language).toBe('en');
    expect(buildLeadThankYou(parseLeadThankYou({ enabled: true }), 'en', { name: 'Dana', studio: 'S' })).toBeNull();
  });

  it('no stray space before the comma when there is no name', () => {
    expect(buildLeadThankYou(on, 'en', { name: ' ', studio: 'S' })?.body.startsWith('Hi,')).toBe(true);
  });
});

describe('withThankYouDefaults (settings card)', () => {
  const defaults = { subject_en: 'S en', body_en: 'B en', subject_he: 'S he', body_he: 'B he' };
  it('nothing saved: off, with the ready-made wording in both languages', () => {
    expect(withThankYouDefaults({}, defaults)).toEqual({ enabled: false, ...defaults });
  });
  it('keeps what the studio wrote and fills only the blanks', () => {
    expect(withThankYouDefaults({ enabled: true, body_en: 'Mine', subject_he: '  ' }, defaults)).toEqual({
      enabled: true,
      ...defaults,
      body_en: 'Mine',
    });
  });
});
