/**
 * Enrolment terms and their fields follow the studio's "teaches classes"
 * switch (owner decision): dance wording only for dance studios that teach
 * classes, general class wording for other class businesses, and studios that
 * don't teach classes get the service agreement, not enrolment terms.
 * Run: pnpm -C apps/web test legal-class-terms.test.ts
 */
import { describe, it, expect } from 'vitest';
import type { VerticalId } from '@shared/config/tenant-presets';
import { loadLegalTemplate } from '@/legal/templates';
import { prepareLegalMarkdown } from '@/legal/render';
import { fieldsForVertical } from '@/legal/fields';
import { tenantHasEnrolmentTerms } from '@/legal/useLegalDocument';
import { packDocumentsFor } from '@/legal/lawyerDocuments';
import { legalPackInfoDocs } from '@/legal/legalPack';

async function terms(lang: 'en' | 'he', vertical: VerticalId, teachesClasses = true) {
  const raw = await loadLegalTemplate('enrolment-terms', lang);
  return prepareLegalMarkdown(raw, {
    doc: 'enrolment-terms',
    lang,
    vertical,
    tenantName: 'Studio',
    contactEmail: 'a@b.c',
    profile: { dress_code: 'black leotard', performance_details: 'June show' },
    updatedAt: null,
    teachesClasses,
  }).markdown;
}

const DANCE_FIELDS = ['performance_details', 'dress_code', 'watching_rule', 'filming_rule'];
const CLASS_FIELDS = ['payment_methods', 'max_makeups', 'collection_age'];
const keys = (v: VerticalId, teaches: boolean) => fieldsForVertical(v, teaches).map((f) => f.key);

describe('enrolment terms follow "teaches classes"', () => {
  it('a dance studio that teaches classes keeps the dance lines', async () => {
    const en = await terms('en', 'dance-studio');
    expect(en).toMatch(/end-of-year performance/);
    expect(en).toContain('Dress code: black leotard');
    expect(en).not.toContain('Clothing and equipment');
    const he = await terms('he', 'dance-studio');
    expect(he).toMatch(/מופע סוף שנה/);
    expect(he).not.toContain('לבוש וציוד');
  });

  it.each(['generic', 'beautician'] as const)('a %s class business gets general class wording, no dance words', async (v) => {
    const en = await terms('en', v);
    expect(en).toContain('Clothing and equipment: as the studio tells you for each class');
    expect(en).toMatch(/Events \(for example an exhibition or open lesson\)/);
    expect(en).not.toMatch(/performance|costume|tournament|Dress code|DANCE CLASSES ONLY|OTHER CLASSES ONLY/i);
    const he = await terms('he', v);
    expect(he).toContain('לבוש וציוד');
    expect(he).not.toMatch(/מופע|תלבושות|טורניר|רק לחוגי מחול|רק לחוגים אחרים/);
  });

  it('studios that do not teach classes have no enrolment terms (service agreement instead)', () => {
    for (const v of ['generic', 'beautician', 'dance-studio'] as const) {
      expect(tenantHasEnrolmentTerms(v, false)).toBe(false);
      expect(packDocumentsFor(v, false)).not.toContain('enrolment-terms');
      expect(legalPackInfoDocs(v, false)).not.toContain('enrolment-terms');
    }
    expect(tenantHasEnrolmentTerms('generic', true)).toBe(true);
    expect(tenantHasEnrolmentTerms('photographer', true)).toBe(false);
  });
});

describe('fields follow "teaches classes"', () => {
  it('dance fields only for dance studios that teach classes', () => {
    for (const k of DANCE_FIELDS) {
      expect(keys('dance-studio', true)).toContain(k);
      expect(keys('dance-studio', false)).not.toContain(k);
      expect(keys('generic', true)).not.toContain(k);
      expect(keys('beautician', true)).not.toContain(k);
    }
  });

  it('class fields for any class business, none when classes are off', () => {
    for (const k of CLASS_FIELDS) {
      expect(keys('generic', true)).toContain(k);
      expect(keys('beautician', true)).toContain(k);
      expect(keys('generic', false)).not.toContain(k);
      expect(keys('photographer', true)).not.toContain(k);
    }
  });
});
