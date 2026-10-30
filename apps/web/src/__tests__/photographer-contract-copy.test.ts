import { describe, expect, it } from 'vitest';
import en from '@/i18n/en.json';
import he from '@/i18n/he.json';

// Photographer tenants sign a shoot contract on /enrol/complete, so they get
// their own copy instead of the class-waiver wording ("See you in class!").
const JOB_KEYS = [
  'page_title',
  'sign_prompt',
  'signed_heading',
  'signed_body',
  'already_signed_heading',
  'already_signed_body',
  'cancelled_heading',
  'cancelled_body',
  'back_home',
] as const;

const CONTRACT_FORM_KEYS = [
  'contract_document_region',
  'contract_checkbox_label',
  'contract_context_client',
  'contract_context_package',
] as const;

type Dict = Record<string, unknown>;
const jobCopy = (d: Dict) => ((d.pages as Dict).enrol_complete as Dict).job as Record<string, string>;
const enrolment = (d: Dict) => d.enrolment as Record<string, string>;

describe('photographer contract copy', () => {
  for (const [lang, dict] of [['en', en], ['he', he]] as const) {
    it(`${lang}: has every contract page and form string`, () => {
      for (const key of JOB_KEYS) expect(jobCopy(dict)[key], key).toBeTruthy();
      for (const key of CONTRACT_FORM_KEYS) expect(enrolment(dict)[key], key).toBeTruthy();
    });
  }

  it('en: never mentions classes, waivers or enrolment', () => {
    const text = [
      ...JOB_KEYS.map((k) => jobCopy(en)[k]),
      ...CONTRACT_FORM_KEYS.map((k) => enrolment(en)[k]),
    ].join(' ');
    expect(text).not.toMatch(/class|waiver|enrol/i);
  });

  it('he: never mentions lessons, waivers or registration', () => {
    const text = [
      ...JOB_KEYS.map((k) => jobCopy(he)[k]),
      ...CONTRACT_FORM_KEYS.map((k) => enrolment(he)[k]),
    ].join(' ');
    expect(text).not.toMatch(/שיעור|ויתור|הרשמה/);
  });
});
