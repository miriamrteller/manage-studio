import { consentWording, MARKETING_KINDS, PHOTO_KINDS, type ConsentKind } from './consents';
import type { LegalDocId } from './fields';
import { legalTextVersion, prepareLegalMarkdown, renderLegalHtml, type LegalLang } from './render';
import {
  prepareSignedTemplate,
  SIGNED_DOC_TITLES,
  signedDocForVertical,
  signedTemplateSource,
  type SignedDocId,
} from './signedTemplates';
import { loadLegalTemplate } from './templates';
import { tenantHasEnrolmentTerms, type TenantLegalProfile } from './useLegalDocument';

/** One document of the pack, in both languages (English prevails). */
export interface LegalPackSection {
  id: LegalDocId | SignedDocId | 'consents';
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
  /** The signed template to seed for this studio, in its own language (null: none for its type). */
  signedTemplate: { name: string; content: string } | null;
}

const INFO_TITLES: Partial<Record<LegalDocId, Record<LegalLang, string>>> = {
  'studio-privacy': { en: 'Privacy policy', he: 'מדיניות פרטיות' },
  'enrolment-terms': { en: 'Enrolment terms', he: 'תנאי הרשמה' },
  accessibility: { en: 'Accessibility statement', he: 'הצהרת נגישות' },
  cookies: { en: 'Cookie and storage notice', he: 'הודעה על עוגיות ואחסון' },
};

/** The studio's informational documents, by type. */
export function legalPackInfoDocs(vertical: TenantLegalProfile['vertical']): LegalDocId[] {
  return [
    'studio-privacy',
    ...(tenantHasEnrolmentTerms(vertical) ? (['enrolment-terms'] as LegalDocId[]) : []),
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

  for (const doc of legalPackInfoDocs(legal.vertical)) {
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
      });
      section.body[lang] = { html: renderLegalHtml(prepared) };
      section.missing[lang] = prepared.missingLabels;
    }
    sections.push(section);
  }

  const signedDoc = signedDocForVertical(legal.vertical);
  let signedTemplate: LegalPack['signedTemplate'] = null;
  if (signedDoc) {
    const section: LegalPackSection = {
      id: signedDoc,
      title: SIGNED_DOC_TITLES[signedDoc],
      body: { en: {}, he: {} },
      missing: { en: [], he: [] },
    };
    for (const lang of LANGS) {
      const text = prepareSignedTemplate(signedTemplateSource(signedDoc, lang), signedDoc, {
        lang,
        tenantName: legal.name,
        contactEmail: legal.contactEmail,
        profile: legal.profile,
      });
      section.body[lang] = { text };
      if (lang === legal.languageDefault) {
        signedTemplate = { name: SIGNED_DOC_TITLES[signedDoc][lang], content: text };
      }
    }
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
  return { sections, version: legalTextVersion(all), signedTemplate };
}
