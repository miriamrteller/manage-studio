/**
 * Studio legal pack: drafting notes never reach studios or parents; the signed
 * templates (health declaration, photography agreement) are built per studio;
 * the pack holds every document in English and Hebrew.
 * Run: pnpm -C apps/web test legal-pack.test.ts
 */
import { describe, expect, it } from 'vitest';
import { loadLegalFile, loadLegalTemplate } from '@/legal/templates';
import { prepareLegalMarkdown, stripDraftingFrame } from '@/legal/render';
import { prepareSignedTemplate, signedDocForVertical } from '@/legal/signedTemplates';
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
  it('a dance studio signs a health declaration, a photographer a contract, others nothing', () => {
    expect(signedDocForVertical('dance-studio')).toBe('health-declaration');
    expect(signedDocForVertical('photographer')).toBe('photography-contract');
    expect(signedDocForVertical('generic')).toBeNull();
  });

  it.each(['en', 'he'] as const)('health declaration (%s): only what a parent reads, filled, plain text', async (lang) => {
    const text = prepareSignedTemplate(await loadLegalFile('07b-health-declaration', lang), 'health-declaration', {
      lang,
      tenantName: 'Harbour Dance',
      contactEmail: 'office@harbour.test',
      profile,
    });
    expect(text).toContain('Harbour Dance');
    expect(text).not.toMatch(/What the law requires|מה הדין דורש|Version B|גרסה ב|Note on the current app text|הערה על הנוסח/);
    expect(text).not.toMatch(DRAFTING);
    expect(text).not.toContain('[[');
    expect(text).not.toContain('**');
    expect(text).toMatch(lang === 'en' ? /Privacy notice/ : /הודעת פרטיות/);
  });

  it.each(['en', 'he'] as const)('photography contract (%s): studio details and defaults filled, merge fields kept', async (lang) => {
    const text = prepareSignedTemplate(await loadLegalFile('07c-photography-contract', lang), 'photography-contract', {
      lang,
      tenantName: 'Lens Studio',
      contactEmail: 'hi@lens.test',
      profile,
    });
    expect(text).toContain('Harbour Dance Ltd');
    expect(text).toContain('514000000');
    expect(text).toContain('{{client_name}}');
    expect(text).toContain('30%');
    expect(text).not.toContain('[[');
    expect(text).not.toMatch(DRAFTING);
  });
});

describe('the legal pack', () => {
  it('a dance studio: privacy, terms, accessibility, cookies, health declaration and consents, in both languages', async () => {
    const pack = await buildLegalPack(legal('dance-studio', 'he'));
    expect(pack.sections.map((s) => s.id)).toEqual([
      'studio-privacy', 'enrolment-terms', 'accessibility', 'cookies', 'health-declaration', 'consents',
    ]);
    for (const s of pack.sections) {
      expect(s.body.en.html ?? s.body.en.text).toBeTruthy();
      expect(s.body.he.html ?? s.body.he.text).toBeTruthy();
    }
    // Seeded in the studio's own language.
    expect(pack.signedTemplate?.name).toBe('הצהרת בריאות');
    expect(pack.signedTemplate?.content).toContain('Harbour Dance');
    expect(pack.version).toMatch(/^[0-9a-f]{8}-/);
  });

  it('a photographer: no enrolment terms, the contract instead', async () => {
    const pack = await buildLegalPack(legal('photographer'));
    expect(pack.sections.map((s) => s.id)).toEqual([
      'studio-privacy', 'accessibility', 'cookies', 'photography-contract', 'consents',
    ]);
    expect(pack.signedTemplate?.name).toBe('Photography services agreement');
  });

  it('the same studio gives the same version; a change to its details gives a new one', async () => {
    const a = await buildLegalPack(legal('generic'));
    const b = await buildLegalPack(legal('generic'));
    const c = await buildLegalPack({ ...legal('generic'), name: 'Other name' });
    expect(a.version).toBe(b.version);
    expect(c.version).not.toBe(a.version);
    expect(a.signedTemplate).toBeNull();
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
