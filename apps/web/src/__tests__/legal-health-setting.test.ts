/**
 * "Clients sign a health declaration" (tenants.health_declaration): prefilled from
 * the field, and the health forms, the insurance question and the insurance line
 * in the terms follow it. The agreement's add-on comes from the field (tutors,
 * coaches and therapists: coaching).
 * Run: pnpm -C apps/web test legal-health-setting.test.ts
 */
import { describe, it, expect } from 'vitest';
import type { VerticalId } from '@shared/config/tenant-presets';
import { fieldHealthDeclarations, fieldLegalAddon, studioFormsScope } from '@shared/legal/field-defaults';
import { signedFormsFor, signedFormsForVertical } from '@shared/legal/signed-template';
import { loadLegalTemplate } from '@/legal/templates';
import { prepareLegalMarkdown } from '@/legal/render';
import { fieldsForVertical } from '@/legal/fields';
import { healthDeclarationFor } from '@/features/platform/lib/studioSetupForm';

const docs = (forms: { doc: string; addon?: string }[]) => forms.map((f) => (f.addon ? `${f.doc}+${f.addon}` : f.doc));

describe('the field prefills the setting', () => {
  it('on for dance, fitness and trainers, yoga and pilates, swimming and martial arts; off otherwise', () => {
    expect(fieldHealthDeclarations({ id: 'dance-studio' })).toBe(true);
    for (const [id, nameEn] of [
      ['personal-trainer', 'Personal trainer'],
      ['fitness', 'Fitness studio'],
      ['yoga-teacher', 'Yoga teacher'],
      ['pilates', 'Pilates studio'],
      ['swim-coach', 'Swim coach'],
      ['martial-arts', 'Martial arts'],
    ]) {
      expect(fieldHealthDeclarations({ id, nameEn }), id).toBe(true);
    }
    for (const id of ['photographer', 'beautician', 'generic']) expect(fieldHealthDeclarations({ id }), id).toBe(false);
    expect(fieldHealthDeclarations({ id: 'private-tutor', nameEn: 'Private tutor' })).toBe(false);
    expect(fieldHealthDeclarations({ id: 'krav', nameHe: 'קרב מגע' })).toBe(true);
  });

  it("a skin's own default wins over its name", () => {
    expect(fieldHealthDeclarations({ id: 'yoga-teacher', nameEn: 'Yoga', healthDeclaration: false })).toBe(false);
    expect(fieldHealthDeclarations({ id: 'music', nameEn: 'Music school', healthDeclaration: true })).toBe(true);
  });

  it('the wizard prefills it from the chosen field', () => {
    expect(healthDeclarationFor('dance-studio')).toBe(true);
    expect(healthDeclarationFor('photographer')).toBe(false);
    expect(healthDeclarationFor('swim-coach', { nameEn: 'Swim coach', nameHe: 'מאמן שחייה', switches: {} })).toBe(true);
  });

  it('a studio that chose keeps its choice', () => {
    expect(studioFormsScope({ id: 'dance-studio' }, false).healthDeclarations).toBe(false);
    expect(studioFormsScope({ id: 'generic' }, true).healthDeclarations).toBe(true);
    expect(studioFormsScope({ id: 'generic' }, null).healthDeclarations).toBe(false);
  });
});

describe('the forms clients sign', () => {
  it('existing studios (no setting) sign what they signed before', () => {
    expect(docs(signedFormsForVertical('dance-studio'))).toEqual(['health-declaration-child', 'health-declaration-adult']);
    expect(docs(signedFormsForVertical('photographer'))).toEqual(['service-agreement+addon-photographer']);
    expect(docs(signedFormsForVertical('beautician'))).toEqual(['service-agreement+addon-beautician']);
    expect(docs(signedFormsForVertical('generic'))).toEqual(['service-agreement']);
  });

  it('the setting adds or removes the health declarations', () => {
    expect(docs(signedFormsFor('generic', { healthDeclarations: true }))).toEqual([
      'health-declaration-child',
      'health-declaration-adult',
      'service-agreement',
    ]);
    expect(signedFormsFor('dance-studio', { healthDeclarations: false })).toEqual([]);
  });

  it('tutors, coaches and therapists get the coaching add-on, from the field', () => {
    for (const [id, nameEn] of [['private-tutor', 'Private tutor'], ['life-coach', 'Life coach'], ['therapist', 'Therapist']]) {
      expect(fieldLegalAddon({ id, nameEn }), id).toBe('coaching');
    }
    expect(fieldLegalAddon({ id: 'music', nameEn: 'Music school', legalAddon: 'coaching' })).toBe('coaching');
    expect(fieldLegalAddon({ id: 'generic' })).toBeNull();
    expect(fieldLegalAddon({ id: 'photographer' })).toBe('photographer');
    const [agreement] = signedFormsFor('private-tutor', { legalAddon: 'coaching' });
    expect(docs([agreement])).toEqual(['service-agreement+addon-coaching']);
    expect(agreement.title.en).toBe('Sessions agreement');
  });
});

describe('the insurance question and wording follow the setting', () => {
  const keys = (vertical: VerticalId, healthDeclarations?: boolean) =>
    fieldsForVertical(vertical, { teachesClasses: true, healthDeclarations }).map((f) => f.key);

  it('asked only when clients sign a health declaration', () => {
    expect(keys('dance-studio')).toContain('insurance_status');
    expect(keys('dance-studio', false)).not.toContain('insurance_status');
    expect(keys('generic')).not.toContain('insurance_status');
    expect(keys('generic', true)).toEqual(expect.arrayContaining(['insurance_status', 'health_retention_years']));
  });

  async function terms(healthDeclarations: boolean) {
    return prepareLegalMarkdown(await loadLegalTemplate('enrolment-terms', 'en'), {
      doc: 'enrolment-terms',
      lang: 'en',
      vertical: 'generic',
      tenantName: 'Studio',
      contactEmail: 'a@b.c',
      profile: {},
      updatedAt: null,
      teachesClasses: true,
      healthDeclarations,
    }).markdown;
  }

  it('a class studio that collects health declarations tells parents about insurance', async () => {
    expect(await terms(true)).toMatch(/does not currently hold insurance covering participants/);
    expect(await terms(false)).not.toMatch(/insurance covering participants/);
  });
});
