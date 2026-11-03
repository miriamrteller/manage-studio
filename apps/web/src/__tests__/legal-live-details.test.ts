/**
 * Lawyer-reviewed versions keep the studio's details as live fields
 * ({{detail:…}}): filled from the current settings when shown, so a changed
 * detail updates the lawyer version while the approved wording stays.
 * Run: pnpm -C apps/web test legal-live-details.test.ts
 */
import { describe, it, expect } from 'vitest';
import type { VerticalId } from '@shared/config/tenant-presets';
import { loadLegalTemplate } from '@/legal/templates';
import {
  fillLiveDetails,
  prepareLegalMarkdown,
  renderLegalHtml,
  tokenizeKnownValues,
  type LegalRenderContext,
} from '@/legal/render';
import { LEGAL_FIELDS, type LegalDocId } from '@/legal/fields';
import { pdfsAffectedByChange, type LawyerDocument } from '@/legal/lawyerDocuments';

const PROFILE: Record<string, string> = {
  legal_name: 'Creative Ballet Ltd',
  business_status: 'company',
  business_number: '514123456',
  address: '1 Herzl St, Haifa',
  phone: '050-1234567',
  email: 'office@creativeballet.test',
  privacy_contact_name: 'Dana Levi',
  insurance_status: 'insured',
  insurance: 'third-party liability insurance with Harel',
};

const ctx = (doc: LegalDocId, lang: 'en' | 'he', vertical: VerticalId, profile = PROFILE): LegalRenderContext => ({
  doc,
  lang,
  vertical,
  tenantName: 'Creative Ballet',
  contactEmail: 'hello@creativeballet.test',
  profile,
  updatedAt: '2026-11-01T10:00:00Z',
});

const DOCS: LegalDocId[] = ['studio-privacy', 'enrolment-terms', 'accessibility', 'cookies'];

describe('live details', () => {
  for (const vertical of ['dance-studio', 'generic', 'photographer'] as VerticalId[]) {
    for (const doc of DOCS) {
      for (const lang of ['en', 'he'] as const) {
        it(`${vertical} ${doc} (${lang}): filling the live draft gives the same text as the draft`, async () => {
          if (doc === 'enrolment-terms' && vertical === 'photographer') return;
          const raw = await loadLegalTemplate(doc, lang);
          const c = ctx(doc, lang, vertical);
          const plain = prepareLegalMarkdown(raw, c);
          const live = prepareLegalMarkdown(raw, c, { liveDetails: true });
          if (doc !== 'cookies') expect(live.markdown).toMatch(/\{\{detail:/);
          const norm = (h: string) => h.replace(/[ \t]+\n/g, '\n');
          expect(norm(renderLegalHtml(fillLiveDetails(live.markdown, c)))).toBe(norm(renderLegalHtml(plain)));
        });
      }
    }
  }

  it('a changed detail updates the lawyer version; the wording stays', async () => {
    const raw = await loadLegalTemplate('studio-privacy', 'en');
    const lawyerText = prepareLegalMarkdown(raw, ctx('studio-privacy', 'en', 'dance-studio'), { liveDetails: true })
      .markdown.replace('This policy', 'This privacy policy (reviewed by our lawyer)');
    const before = fillLiveDetails(lawyerText, ctx('studio-privacy', 'en', 'dance-studio')).markdown;
    const after = fillLiveDetails(
      lawyerText,
      ctx('studio-privacy', 'en', 'dance-studio', { ...PROFILE, address: '22 Jaffa Rd, Jerusalem' }),
    ).markdown;
    expect(before).toContain('1 Herzl St, Haifa');
    expect(after).toContain('22 Jaffa Rd, Jerusalem');
    expect(after).not.toContain('1 Herzl St, Haifa');
    expect(after).toContain('reviewed by our lawyer');
  });

  it('the insurance sentence follows the insurance choice', () => {
    const text = '- {{detail:insurance_statement}}';
    const c = ctx('enrolment-terms', 'en', 'dance-studio');
    expect(fillLiveDetails(text, c).markdown).toBe('- The studio holds third\\-party liability insurance with Harel.');
    expect(fillLiveDetails(text, { ...c, profile: { ...PROFILE, insurance_status: 'none' } }).markdown).toContain(
      'does not currently hold insurance',
    );
    expect(fillLiveDetails(text, { ...c, vertical: 'generic' }).markdown).toBe('- ');
  });

  it('an empty detail shows as "to be completed", as in the drafts', () => {
    const out = fillLiveDetails('Call {{detail:phone}}.', ctx('studio-privacy', 'en', 'dance-studio', { ...PROFILE, phone: '' }));
    expect(out.missing).toContain('phone');
    expect(out.missingLabels[0]).toMatch(/to be completed/);
  });

  it('pasted text: the current values become live details again (exact, longest first)', () => {
    const c = ctx('studio-privacy', 'en', 'dance-studio');
    const { text, count } = tokenizeKnownValues(
      'Creative Ballet Ltd (Creative Ballet), 1 Herzl St, Haifa, 050-1234567. Already {{detail:email}}.',
      c,
    );
    expect(text).toBe(
      '{{detail:legal_name}} ({{detail:studio_name}}), {{detail:address}}, {{detail:phone}}. Already {{detail:email}}.',
    );
    expect(count).toBe(4);
  });
});

describe('the "PDF isn\'t updated" notice', () => {
  const pdf = (document: LawyerDocument['document']): LawyerDocument => ({
    document, language: 'en', kind: 'pdf', content: null, storagePath: 'x.pdf', fileName: 'x.pdf', uploadedAt: '2026-11-02T10:00:00Z',
  });
  const text = (document: LawyerDocument['document']): LawyerDocument => ({ ...pdf(document), kind: 'text', content: 'x', storagePath: null });
  const byKey = Object.fromEntries(LEGAL_FIELDS.map((f) => [f.key, f.placeholders]));

  it('lists only PDFs that use a changed detail; text versions stay live', () => {
    const uploads = [pdf('studio-privacy'), pdf('cookies'), text('enrolment-terms')];
    expect(pdfsAffectedByChange(uploads, ['address'], byKey)).toEqual(['studio-privacy', 'cookies']);
    expect(pdfsAffectedByChange(uploads, ['dress_code'], byKey)).toEqual([]);
    expect(pdfsAffectedByChange(uploads, [], byKey)).toEqual([]);
    expect(pdfsAffectedByChange([text('studio-privacy')], ['address'], byKey)).toEqual([]);
  });
});
