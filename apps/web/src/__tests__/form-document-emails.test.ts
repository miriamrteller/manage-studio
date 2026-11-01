/**
 * Emails name the document a client signs by studio type, never "waiver"
 * (docs/legal/07b): dance → health declaration, photographer → contract,
 * everyone else → form. Both languages.
 * Run: pnpm -C apps/web test form-document-emails.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  EMAIL_TEMPLATE_NAMES,
  formDocumentForVertical,
  getEmailStrings,
  getEmailStringsForDocument,
  type EmailTemplateName,
} from '../../../../packages/shared/src/i18n/email';
import { renderEnrolmentConfirmationHtml } from '../../../../supabase/functions/_shared/render-enrolment-confirmation-email';

const TEMPLATES: EmailTemplateName[] = [
  EMAIL_TEMPLATE_NAMES.WAIVER_REMINDER,
  EMAIL_TEMPLATE_NAMES.WAIVER_CANCELLED,
  EMAIL_TEMPLATE_NAMES.ENROLMENT_CONFIRMATION,
  EMAIL_TEMPLATE_NAMES.APPOINTMENT_CONFIRMATION,
];
const WAIVER = /waiver|ויתור/i;

function texts(strings: Record<string, unknown>): string[] {
  return Object.values(strings).filter((v): v is string => typeof v === 'string');
}

describe('document kind by studio type', () => {
  it('maps verticals', () => {
    expect(formDocumentForVertical('dance-studio')).toBe('health_declaration');
    expect(formDocumentForVertical('photographer')).toBe('contract');
    for (const v of ['generic', 'beautician', null, undefined]) expect(formDocumentForVertical(v)).toBe('form');
  });
});

describe.each(['en', 'he'] as const)('email wording (%s)', (lang) => {
  it('no email string calls it a waiver, for any studio type', () => {
    for (const template of TEMPLATES) {
      for (const kind of ['form', 'health_declaration', 'contract'] as const) {
        for (const text of texts(getEmailStringsForDocument(lang, template, kind))) {
          expect(text, `${template}/${kind}`).not.toMatch(WAIVER);
        }
      }
    }
  });

  it('the reminder names the right document', () => {
    const subject = (kind: 'form' | 'health_declaration' | 'contract') =>
      String(getEmailStringsForDocument(lang, EMAIL_TEMPLATE_NAMES.WAIVER_REMINDER, kind).subject);
    expect(subject('form')).toMatch(lang === 'en' ? /your form/ : /הטופס/);
    expect(subject('health_declaration')).toMatch(lang === 'en' ? /health declaration/ : /הצהרת הבריאות/);
    expect(subject('contract')).toMatch(lang === 'en' ? /contract/ : /החוזה/);
  });

  it('is bilingual: Hebrew strings are Hebrew', () => {
    const body = String(getEmailStrings(lang, EMAIL_TEMPLATE_NAMES.WAIVER_REMINDER).body);
    expect(/[֐-׿]/.test(body)).toBe(lang === 'he');
  });

  it('the enrolment confirmation awaiting a signature uses the studio type', () => {
    const render = (vertical: string | null) =>
      renderEnrolmentConfirmationHtml({
        language: lang,
        schoolName: 'Studio',
        recipientName: 'Dana',
        studentName: 'Noa',
        showStudentRow: true,
        className: 'Ballet 1',
        paymentSummary: { amountFormatted: '₪350', paidOnFormatted: 'today', paymentMethodLabel: 'Visa' },
        pendingWaiver: true,
        vertical,
        signUrl: 'https://x/sign',
        deadlineDate: '2027-01-01',
        primaryColor: '#000000',
        accentColor: '#111111',
      }).replace(/<[^>]+>/g, ' ');
    const dance = render('dance-studio');
    const other = render('generic');
    expect(dance).toMatch(lang === 'en' ? /health declaration/i : /הצהרת הבריאות/);
    expect(other).toMatch(lang === 'en' ? /your form/i : /הטופס/);
    expect(other).not.toMatch(/health declaration|הצהרת הבריאות/i);
    for (const html of [dance, other]) expect(html).not.toMatch(WAIVER);
  });
});
