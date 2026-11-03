import { consentWording, MARKETING_KINDS, PHOTO_KINDS, type ConsentKind } from './consents';
import type { LegalDocId } from './fields';
import { legalTextVersion, prepareLegalMarkdown, renderLegalHtml, type LegalLang } from './render';
import { prepareSignedForm, signedFormsForSkin } from './signedTemplates';
import { loadLegalTemplate } from './templates';
import { tenantHasEnrolmentTerms, type TenantLegalProfile } from './useLegalDocument';

/** One document of the pack, in both languages (English prevails). */
export interface LegalPackSection {
  /** Informational document id, a signed form's key (e.g. health-child), or 'consents'. */
  id: string;
  title: Record<LegalLang, string>;
  /** HTML (informational documents) or plain text (signed documents and consents). */
  body: Record<LegalLang, { html?: string; text?: string }>;
  /** Placeholders the studio has not filled yet (per language). */
  missing: Record<LegalLang, string[]>;
}

export interface LegalPack {
  sections: LegalPackSection[];
  /** Hash of everything in the pack; stored with the acknowledgement. */
  version: string;
  /** The studio's signed forms (seeded at creation), in its own language. */
  signedForms: Array<{ key: string; name: string }>;
}

const INFO_TITLES: Partial<Record<LegalDocId, Record<LegalLang, string>>> = {
  'studio-privacy': { en: 'Privacy policy', he: 'מדיניות פרטיות' },
  'enrolment-terms': { en: 'Enrolment terms', he: 'תנאי הרשמה' },
  accessibility: { en: 'Accessibility statement', he: 'הצהרת נגישות' },
  cookies: { en: 'Cookie and storage notice', he: 'הודעה על עוגיות ואחסון' },
};

/** The studio's informational documents, by type. */
export function legalPackInfoDocs(vertical: TenantLegalProfile['vertical'], teachesClasses = true): LegalDocId[] {
  return [
    'studio-privacy',
    ...(tenantHasEnrolmentTerms(vertical, teachesClasses) ? (['enrolment-terms'] as LegalDocId[]) : []),
    'accessibility',
    'cookies',
  ];
}

/** The fixed in-app consents this studio asks for (docs/legal 08 and 09). */
function consentKinds(vertical: TenantLegalProfile['vertical']): ConsentKind[] {
  const photo: ConsentKind[] = vertical === 'photographer' ? ['portfolio'] : [...PHOTO_KINDS];
  return [...photo, ...MARKETING_KINDS];
}

const LANGS: LegalLang[] = ['en', 'he'];

/** Every document of the studio's legal pack, filled with its details, in English and Hebrew. */
export async function buildLegalPack(legal: TenantLegalProfile): Promise<LegalPack> {
  const sections: LegalPackSection[] = [];

  for (const doc of legalPackInfoDocs(legal.vertical, legal.teachesClasses !== false)) {
    const section: LegalPackSection = {
      id: doc,
      title: INFO_TITLES[doc] ?? { en: doc, he: doc },
      body: { en: {}, he: {} },
      missing: { en: [], he: [] },
    };
    for (const lang of LANGS) {
      const prepared = prepareLegalMarkdown(await loadLegalTemplate(doc, lang), {
        doc,
        lang,
        vertical: legal.vertical,
        tenantName: legal.name,
        contactEmail: legal.contactEmail,
        profile: legal.profile,
        updatedAt: legal.updatedAt,
        teachesClasses: legal.teachesClasses !== false,
      });
      section.body[lang] = { html: renderLegalHtml(prepared) };
      section.missing[lang] = prepared.missingLabels;
    }
    sections.push(section);
  }

  const signedForms: LegalPack['signedForms'] = [];
  for (const form of signedFormsForSkin(legal.skin ?? legal.vertical, legal.legalAddon)) {
    const section: LegalPackSection = {
      id: form.key,
      title: form.title,
      body: { en: {}, he: {} },
      missing: { en: [], he: [] },
    };
    for (const lang of LANGS) {
      const text = prepareSignedForm(form, {
        lang,
        tenantName: legal.name,
        contactEmail: legal.contactEmail,
        profile: legal.profile,
        vertical: legal.vertical,
      });
      section.body[lang] = { text };
    }
    signedForms.push({ key: form.key, name: form.title[legal.languageDefault] });
    sections.push(section);
  }

  const kinds = consentKinds(legal.vertical);
  sections.push({
    id: 'consents',
    title: { en: 'Consent checkboxes', he: 'תיבות הסכמה' },
    body: {
      en: { text: kinds.map((k) => `☐ ${consentWording(k, 'en', { student: 'the student', studio: legal.name })}`).join('\n') },
      he: { text: kinds.map((k) => `☐ ${consentWording(k, 'he', { student: 'התלמיד/ה', studio: legal.name })}`).join('\n') },
    },
    missing: { en: [], he: [] },
  });

  const all = sections
    .map((s) => LANGS.map((l) => s.body[l].html ?? s.body[l].text ?? '').join('\n'))
    .join('\n');
  return { sections, version: legalTextVersion(all), signedForms };
}
