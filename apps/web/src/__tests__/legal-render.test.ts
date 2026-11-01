import { describe, expect, it } from 'vitest';
import { loadLegalTemplate } from '@/legal/templates';
import {
  escapeMarkdownValue,
  prepareLegalMarkdown,
  renderLegalHtml,
  type LegalRenderContext,
} from '@/legal/render';
import { LEGAL_FIELDS, type LegalDocId } from '@/legal/fields';

const fullDanceProfile: Record<string, string> = {
  legal_name: 'Creative Ballet Academy Ltd',
  business_status: 'osek_patur',
  business_number: '123456789',
  address: '1 Herzl St, Tel Aviv',
  phone: '050-1234567',
  privacy_contact_name: 'Studio manager',
  privacy_contact_email: 'privacy@example.com',
  payment_providers: 'Grow, iCount',
  season_name: '2026–2027',
  season_start: '2026-09-01',
  season_end: '2027-06-30',
  lesson_count: '34',
  season_price: '3,000',
  monthly_price: '300',
  month_count: '10',
  payment_methods: 'bank transfer, Bit',
  payment_dates: 'on the 1st of each month',
  insurance: 'third-party liability insurance with Example Insurance',
};

function ctx(doc: LegalDocId, lang: 'he' | 'en', profile: Record<string, string>, vertical: LegalRenderContext['vertical'] = 'dance-studio'): LegalRenderContext {
  return {
    doc,
    lang,
    vertical,
    tenantName: 'Creative Ballet',
    contactEmail: 'hello@example.com',
    profile,
    updatedAt: '2026-11-01T10:00:00Z',
  };
}

describe('prepareLegalMarkdown', () => {
  it.each([
    ['studio-privacy', 'en'],
    ['studio-privacy', 'he'],
    ['enrolment-terms', 'en'],
    ['enrolment-terms', 'he'],
    ['accessibility', 'en'],
    ['accessibility', 'he'],
    ['cookies', 'en'],
    ['cookies', 'he'],
  ] as const)('fills every placeholder of %s (%s) for a complete dance profile', async (doc, lang) => {
    const raw = await loadLegalTemplate(doc, lang);
    const out = prepareLegalMarkdown(raw, ctx(doc, lang, fullDanceProfile));
    expect(out.missing).toEqual([]);
    expect(out.markdown).not.toContain('[[');
    expect(out.markdown).not.toMatch(/Draft, not legal advice|טיוטה, לא ייעוץ משפטי/);
    expect(out.markdown).not.toMatch(/Sources relied on|### מקורות|How this was checked/);
  });

  it('keeps only the dance variant for a dance studio', async () => {
    const raw = await loadLegalTemplate('studio-privacy', 'en');
    const out = prepareLegalMarkdown(raw, ctx('studio-privacy', 'en', fullDanceProfile));
    expect(out.markdown).toContain('### A. Dance school');
    expect(out.markdown).not.toContain('### B. Photography');
    expect(out.markdown).toContain('## 2. Who we share it with');
  });

  it('keeps only the photography variant for a photographer', async () => {
    const raw = await loadLegalTemplate('studio-privacy', 'he');
    const out = prepareLegalMarkdown(raw, ctx('studio-privacy', 'he', { ...fullDanceProfile, gallery_service: 'Pixieset' }, 'photographer'));
    expect(out.markdown).toContain('### ב. צילום');
    expect(out.markdown).not.toContain('### א. בית ספר למחול');
    expect(out.markdown).toContain('Pixieset');
    expect(out.missing).toEqual([]);
  });

  it('drops both variants for a generic studio', async () => {
    const raw = await loadLegalTemplate('studio-privacy', 'en');
    const out = prepareLegalMarkdown(raw, ctx('studio-privacy', 'en', fullDanceProfile, 'generic'));
    expect(out.markdown).not.toContain('### A. Dance school');
    expect(out.markdown).not.toContain('### B. Photography');
  });

  it('reports missing fields and blocks receipts until the business is registered', async () => {
    const raw = await loadLegalTemplate('enrolment-terms', 'en');
    const out = prepareLegalMarkdown(
      raw,
      ctx('enrolment-terms', 'en', { ...fullDanceProfile, business_status: 'not_registered', insurance: '' }),
    );
    expect(out.missing).toContain('receipts');
    expect(out.missing).toContain('insurance');
    expect(out.markdown).toContain('not yet a registered business');
    const html = renderLegalHtml(out);
    expect(html).toContain('class="legal-missing"');
  });

  it('writes VAT wording from the business status', async () => {
    const raw = await loadLegalTemplate('enrolment-terms', 'he');
    const patur = prepareLegalMarkdown(raw, ctx('enrolment-terms', 'he', fullDanceProfile));
    expect(patur.markdown).toContain('ללא מע"מ');
    const murshe = prepareLegalMarkdown(raw, ctx('enrolment-terms', 'he', { ...fullDanceProfile, business_status: 'osek_murshe' }));
    expect(murshe.markdown).toContain('כולל מע');
  });

  it('rewrites links between documents to app routes', async () => {
    const raw = await loadLegalTemplate('enrolment-terms', 'en');
    const out = prepareLegalMarkdown(raw, ctx('enrolment-terms', 'en', fullDanceProfile));
    expect(out.markdown).toContain('](/legal/studio-privacy)');
    expect(out.markdown).not.toMatch(/\]\([^)]*\.md\)/);
  });

  it('gives a different version when the studio details change', async () => {
    const raw = await loadLegalTemplate('enrolment-terms', 'en');
    const a = prepareLegalMarkdown(raw, ctx('enrolment-terms', 'en', fullDanceProfile));
    const b = prepareLegalMarkdown(raw, ctx('enrolment-terms', 'en', { ...fullDanceProfile, season_price: '3,100' }));
    expect(a.version).not.toEqual(b.version);
  });
});

describe('escaping studio values', () => {
  it('neutralises markdown and HTML in entered values', async () => {
    const raw = await loadLegalTemplate('studio-privacy', 'en');
    const out = prepareLegalMarkdown(
      raw,
      ctx('studio-privacy', 'en', {
        ...fullDanceProfile,
        legal_name: '<img src=x onerror=alert(1)> [click](javascript:alert(1))',
      }),
    );
    const html = renderLegalHtml(out);
    expect(html).not.toContain('<img');
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain('&lt;img');
  });

  it('escapes markdown punctuation', () => {
    expect(escapeMarkdownValue('a*b_[c](d)')).toBe('a\\*b\\_\\[c\\]\\(d\\)');
  });
});

describe('field registry', () => {
  it('maps every placeholder in the studio-facing templates', async () => {
    // Anything not mapped (and not a note/default/derived) shows up in `missing`
    // as raw text; with an empty profile only field keys should appear.
    const docs: LegalDocId[] = ['studio-privacy', 'enrolment-terms', 'accessibility', 'cookies'];
    const keys = new Set(LEGAL_FIELDS.map((f) => f.key));
    keys.add('receipts');
    keys.add('business_status');
    keys.add('business_number');
    for (const doc of docs) {
      for (const lang of ['en', 'he'] as const) {
        for (const vertical of ['dance-studio', 'photographer'] as const) {
          const raw = await loadLegalTemplate(doc, lang);
          const out = prepareLegalMarkdown(raw, ctx(doc, lang, {}, vertical));
          const unmapped = out.missing.filter((m) => !keys.has(m));
          expect({ doc, lang, vertical, unmapped }).toEqual({ doc, lang, vertical, unmapped: [] });
        }
      }
    }
  });
});
