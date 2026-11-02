/**
 * Studio legal pack: drafting notes never reach studios or parents; the signed
 * forms (child/adult health declarations, the service agreement plus its skin's
 * add-on) are built per studio;
 * the pack holds every document in English and Hebrew.
 * Run: pnpm -C apps/web test legal-pack.test.ts
 */
import { describe, expect, it } from 'vitest';
import { loadLegalFile, loadLegalTemplate } from '@/legal/templates';
import { prepareLegalMarkdown, stripDraftingFrame } from '@/legal/render';
import {
  prepareSignedForm,
  SIGNED_DOC_FILES,
  signedFormsForVertical,
  signedTemplateSource,
  studioSignedForms,
  type SignedDocId,
} from '@/legal/signedTemplates';
import { buildLegalPack } from '@/legal/legalPack';
import { isLegalPackLive, type TenantLegalProfile } from '@/legal/useLegalDocument';
import type { LegalDocId } from '@/legal/fields';
import { isStudioLegalReady } from '../../../../supabase/functions/_shared/studio-legal';

const STUDIO_DOCS: LegalDocId[] = ['studio-privacy', 'enrolment-terms', 'accessibility', 'cookies'];
const DRAFTING = /Draft, not legal advice|Sources relied on|How this was checked|### מקורות|איך זה נבדק|LAWYER:|עו"ד:/;

const profile = {
  legal_name: 'Harbour Dance Ltd',
  business_status: 'osek_murshe',
  business_number: '514000000',
  address: '1 Harbour St, Haifa',
  phone: '04-1234567',
  email: 'office@harbour.test',
};

function legal(vertical: TenantLegalProfile['vertical'], languageDefault: 'he' | 'en' = 'en'): TenantLegalProfile {
  return {
    tenantId: 't-1',
    name: 'Harbour Dance',
    contactEmail: 'office@harbour.test',
    vertical,
    profile,
    published: false,
    updatedAt: '2026-11-02T10:00:00Z',
    packRequired: true,
    packAcknowledgedAt: null,
    languageDefault,
    packAckDrafts: [],
  };
}

describe('no disclaimer inside the documents', () => {
  it.each(STUDIO_DOCS.flatMap((doc) => (['en', 'he'] as const).map((lang) => [doc, lang] as const)))(
    '%s (%s): no draft header and no drafting notes, the content is kept',
    async (doc, lang) => {
      const raw = await loadLegalTemplate(doc, lang);
      const out = prepareLegalMarkdown(raw, {
        doc,
        lang,
        vertical: 'dance-studio',
        tenantName: 'Harbour Dance',
        contactEmail: 'office@harbour.test',
        profile,
        updatedAt: null,
      }).markdown;
      expect(out).not.toMatch(DRAFTING);
      expect(out).toMatch(/^# /m);
      expect(out.length).toBeGreaterThan(raw.length / 3);
    },
  );

  it('cuts at the LAST horizontal rule, like the marketing site', () => {
    const raw = '> Draft, not legal advice.\n\n# Title\n\nBody\n\n---\n\n## Section two\n\nMore\n\n---\n\n### Sources\n- a';
    expect(stripDraftingFrame(raw)).toBe('# Title\n\nBody\n\n---\n\n## Section two\n\nMore\n');
  });
});

describe('signed templates', () => {
  it('the bundled sources match docs/legal (run pnpm email:bundle after editing them)', async () => {
    for (const [doc, prefix] of Object.entries(SIGNED_DOC_FILES)) {
      for (const lang of ['en', 'he'] as const) {
        expect(signedTemplateSource(doc as SignedDocId, lang)).toBe((await loadLegalFile(prefix, lang)).replace(/\r\n/g, '\n'));
      }
    }
  });

  it('each studio type gets its forms, in its language', () => {
    const ctx = { lang: 'he' as const, tenantName: 'Harbour Dance', contactEmail: 'o@x.test', profile: {} };
    const dance = studioSignedForms('dance-studio', ctx);
    expect(dance.map((f) => [f.name, f.audience])).toEqual([
      ['הצהרת בריאות (מתחת לגיל 18)', 'child'],
      ['הצהרת בריאות (מבוגרים)', 'adult'],
    ]);
    const photo = studioSignedForms('photographer', { ...ctx, lang: 'en' });
    expect(photo).toHaveLength(1);
    expect(photo[0].audience).toBeNull();
    expect(photo[0].content).toContain('{{client_name}}');
    expect(studioSignedForms('generic', ctx).map((f) => f.name)).toEqual(['הסכם שירות']);
    // An unknown type is treated as generic.
    expect(studioSignedForms('something-new', ctx).map((f) => f.name)).toEqual(['הסכם שירות']);
  });

  it('class studios sign health declarations; service businesses the agreement plus their add-on', () => {
    expect(signedFormsForVertical('dance-studio').map((f) => f.doc)).toEqual(['health-declaration-child', 'health-declaration-adult']);
    expect(signedFormsForVertical('photographer').map((f) => [f.doc, f.addon])).toEqual([['service-agreement', 'addon-photographer']]);
    expect(signedFormsForVertical('beautician').map((f) => [f.doc, f.addon])).toEqual([['service-agreement', 'addon-beautician']]);
    expect(signedFormsForVertical('generic').map((f) => [f.doc, f.addon])).toEqual([['service-agreement', undefined]]);
  });

  const studioCtx = (lang: 'en' | 'he', vertical: string) => ({
    lang,
    vertical,
    tenantName: 'Harbour Dance',
    contactEmail: 'office@harbour.test',
    profile,
  });

  it.each(
    ['dance-studio', 'photographer', 'beautician', 'generic'].flatMap((v) => (['en', 'he'] as const).map((lang) => [v, lang] as const)),
  )('%s (%s): every form is filled, plain text, with no drafting notes', (vertical, lang) => {
    for (const form of signedFormsForVertical(vertical)) {
      const text = prepareSignedForm(form, studioCtx(lang, vertical));
      expect(text).toContain('Harbour Dance');
      expect(text).not.toMatch(DRAFTING);
      expect(text).not.toContain('[[');
      expect(text).not.toContain(']]');
      expect(text).not.toContain('**');
      expect(text).not.toMatch(/\(shown above the form\)|\(מוצג מעל הטופס\)/);
    }
  });

  it.each(['en', 'he'] as const)('the agreement (%s) holds the base and the add-on; merge fields are kept', (lang) => {
    const [form] = signedFormsForVertical('photographer');
    const text = prepareSignedForm(form, studioCtx(lang, 'photographer'));
    const base = prepareSignedForm(signedFormsForVertical('generic')[0], studioCtx(lang, 'photographer'));
    expect(text.length).toBeGreaterThan(base.length);
    expect(text).toContain('Harbour Dance Ltd');
    expect(text).toContain('514000000');
    expect(text).toContain('{{client_name}}');
  });
});

describe('business status does not change the forms', () => {
  it.each(
    ['photographer', 'beautician', 'generic', 'dance-studio'].flatMap((v) => (['en', 'he'] as const).map((lang) => [v, lang] as const)),
  )('%s (%s) reads the same for every status, apart from the business number', (vertical, lang) => {
    const build = (business_status: string) =>
      signedFormsForVertical(vertical)
        .map((form) =>
          prepareSignedForm(form, {
            lang,
            vertical,
            tenantName: 'Lens Studio',
            contactEmail: 'hi@lens.test',
            profile: { business_status },
          }),
        )
        .join('\n');
    // Business status appears only as an identity fact, on the provider line.
    const withoutIdentity = (t: string) => t.replace(/^(Provider|נותן\/ת השירות): .*$/m, '');
    const texts = ['osek_patur', 'osek_murshe', 'company', 'not_registered', ''].map(build);
    expect(new Set(texts.map(withoutIdentity)).size).toBe(1);
    expect(texts.join('\n')).not.toMatch(/,\s*,|not yet a registered business no\.|טרם נרשם\/ה כעסק מס'/);
  });
});

describe('the legal pack', () => {
  it('a dance studio: privacy, terms, accessibility, cookies, health declaration and consents, in both languages', async () => {
    const pack = await buildLegalPack(legal('dance-studio', 'he'));
    expect(pack.sections.map((s) => s.id)).toEqual([
      'studio-privacy', 'enrolment-terms', 'accessibility', 'cookies', 'health-child', 'health-adult', 'consents',
    ]);
    for (const s of pack.sections) {
      expect(s.body.en.html ?? s.body.en.text).toBeTruthy();
      expect(s.body.he.html ?? s.body.he.text).toBeTruthy();
    }
    // Seeded in the studio's own language.
    expect(pack.signedForms.map((f) => f.name)).toEqual(['הצהרת בריאות (מתחת לגיל 18)', 'הצהרת בריאות (מבוגרים)']);
    expect(pack.version).toMatch(/^[0-9a-f]{8}-/);
  });

  it('a photographer: no enrolment terms, the contract instead', async () => {
    const pack = await buildLegalPack(legal('photographer'));
    expect(pack.sections.map((s) => s.id)).toEqual([
      'studio-privacy', 'accessibility', 'cookies', 'agreement', 'consents',
    ]);
    expect(pack.signedForms.map((f) => f.name)).toEqual(['Photography services agreement']);
  });

  it('the same studio gives the same version; a change to its details gives a new one', async () => {
    const a = await buildLegalPack(legal('generic'));
    const b = await buildLegalPack(legal('generic'));
    const c = await buildLegalPack({ ...legal('generic'), name: 'Other name' });
    expect(a.version).toBe(b.version);
    expect(c.version).not.toBe(a.version);
    expect(a.signedForms.map((f) => f.name)).toEqual(['Service agreement']);
  });
});

describe('when a studio is live', () => {
  it('studios from before the legal pack are always live; new ones once acknowledged', () => {
    expect(isLegalPackLive({ packRequired: false, packAcknowledgedAt: null })).toBe(true);
    expect(isLegalPackLive({ packRequired: true, packAcknowledgedAt: null })).toBe(false);
    expect(isLegalPackLive({ packRequired: true, packAcknowledgedAt: '2026-11-02T10:00:00Z' })).toBe(true);
    // The signing functions use the same rule.
    expect(isStudioLegalReady({ legal_pack_required: false, legal_pack_acknowledged_at: null })).toBe(true);
    expect(isStudioLegalReady({ legal_pack_required: true, legal_pack_acknowledged_at: null })).toBe(false);
    expect(isStudioLegalReady({ legal_pack_required: true, legal_pack_acknowledged_at: '2026-11-02' })).toBe(true);
    expect(isStudioLegalReady(null)).toBe(true);
  });
});
