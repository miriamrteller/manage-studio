import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { legalTextVersion, type LegalLang } from './render';

/**
 * Consent kinds and their exact wording (docs/legal/09-in-app-consent-texts.md
 * and 08-marketing-consent.md). The wording shown is stored with every record,
 * together with CONSENT_WORDING_VERSION, so a record proves what was agreed.
 */
export type ConsentKind =
  | 'photo_internal'
  | 'photo_parents_group'
  | 'photo_public'
  | 'portfolio'
  | 'marketing_email'
  | 'marketing_sms'
  | 'marketing_whatsapp';

export const PHOTO_KINDS: ConsentKind[] = ['photo_internal', 'photo_parents_group', 'photo_public'];
/**
 * Channels offered on forms. OpalSwift has no marketing SMS sender, so SMS is not offered
 * (owner decision, 2026-11-10). 'marketing_sms' stays a valid kind so existing records,
 * the admin history and unsubscribe links keep working.
 */
export const MARKETING_KINDS: ConsentKind[] = ['marketing_email', 'marketing_whatsapp'];

export type ConsentSource = 'enrolment' | 'booking' | 'signup' | 'portal' | 'admin' | 'contract';

interface WordingVars {
  student?: string;
  studio?: string;
}

const WORDING: Record<ConsentKind, Record<LegalLang, string>> = {
  photo_internal: {
    en: 'The studio may photograph/film {student} in class and at performances for internal use (teaching, feedback).',
    he: 'הסטודיו רשאי לצלם את {student} בשיעורים ובמופעים לשימוש פנימי (הוראה, משוב).',
  },
  photo_parents_group: {
    en: "The studio may share photos/videos of {student} in the class parents' group or a private gallery for families.",
    he: 'הסטודיו רשאי לשתף צילומים/סרטונים של {student} בקבוצת ההורים של הקבוצה או בגלריה פרטית למשפחות.',
  },
  photo_public: {
    en: "The studio may publish photos/videos of {student} on the studio's website and social media (no full name shown).",
    he: 'הסטודיו רשאי לפרסם צילומים/סרטונים של {student} באתר וברשתות החברתיות של הסטודיו (ללא ציון שם מלא).',
  },
  portfolio: {
    en: 'The photographer may use selected images from this shoot in their portfolio, website and social media. If minors appear, I am their parent/guardian or have the guardian\'s consent.',
    he: 'הצלם/ת רשאי/ת להשתמש בתמונות נבחרות מהצילום בתיק העבודות, באתר וברשתות החברתיות. אם מופיעים קטינים, אני ההורה/האפוטרופוס שלהם או שקיבלתי את הסכמת האפוטרופוס.',
  },
  marketing_email: {
    en: 'Send me news and offers from {studio} by email. I can unsubscribe at any time.',
    he: 'שלחו לי עדכונים והצעות מ-{studio} בדוא"ל. אפשר להסיר את עצמי בכל עת.',
  },
  marketing_sms: {
    en: 'Send me news and offers from {studio} by SMS. I can unsubscribe at any time.',
    he: 'שלחו לי עדכונים והצעות מ-{studio} ב-SMS. אפשר להסיר את עצמי בכל עת.',
  },
  marketing_whatsapp: {
    en: 'Send me news and offers from {studio} on WhatsApp. I can unsubscribe at any time.',
    he: 'שלחו לי עדכונים והצעות מ-{studio} בוואטסאפ. אפשר להסיר את עצמי בכל עת.',
  },
};

/** Short labels for compact lists (admin/portal). */
const SHORT_LABEL: Record<ConsentKind, Record<LegalLang, string>> = {
  photo_internal: { en: 'Photos for internal use', he: 'צילום לשימוש פנימי' },
  photo_parents_group: { en: "Photos in the parents' group", he: 'צילומים בקבוצת ההורים' },
  photo_public: { en: 'Photos on website and social media', he: 'צילומים באתר וברשתות החברתיות' },
  portfolio: { en: 'Portfolio use of images', he: 'שימוש בתמונות בתיק העבודות' },
  marketing_email: { en: 'Marketing by email', he: 'דיוור בדוא"ל' },
  marketing_sms: { en: 'Marketing by SMS', he: 'דיוור ב-SMS' },
  marketing_whatsapp: { en: 'Marketing on WhatsApp', he: 'דיוור בוואטסאפ' },
};

export const CONSENT_WORDING_VERSION = legalTextVersion(JSON.stringify(WORDING));

export function consentWording(kind: ConsentKind, lang: LegalLang, vars: WordingVars = {}): string {
  return WORDING[kind][lang]
    .replace('{student}', vars.student?.trim() || (lang === 'he' ? 'התלמיד/ה' : 'the student'))
    .replace('{studio}', vars.studio?.trim() || (lang === 'he' ? 'הסטודיו' : 'the studio'));
}

export function consentShortLabel(kind: ConsentKind, lang: LegalLang): string {
  return SHORT_LABEL[kind][lang];
}

export async function recordConsents(input: {
  tenantId: string;
  personId: string;
  items: Array<{ kind: ConsentKind; granted: boolean }>;
  lang: LegalLang;
  vars?: WordingVars;
  source: ConsentSource;
  engagementId?: string | null;
}): Promise<void> {
  if (input.items.length === 0) return;
  const { error } = await supabase.rpc('record_consents', {
    p_tenant_id: input.tenantId,
    p_person_id: input.personId,
    p_items: input.items.map((i) => ({
      kind: i.kind,
      granted: i.granted,
      wording: consentWording(i.kind, input.lang, input.vars),
    })),
    p_wording_version: CONSENT_WORDING_VERSION,
    p_source: input.source,
    p_engagement_id: input.engagementId ?? null,
  });
  if (error) throw error;
}

export type ConsentState = Partial<Record<ConsentKind, boolean>>;

export function usePersonConsents(personId: string | null | undefined) {
  return useQuery({
    queryKey: ['person-consents', personId],
    enabled: !!personId,
    queryFn: async (): Promise<ConsentState> => {
      const { data, error } = await supabase.rpc('get_person_consents', { p_person_id: personId });
      if (error) throw error;
      const state: ConsentState = {};
      for (const row of (data ?? []) as Array<{ kind: ConsentKind; granted: boolean }>) {
        state[row.kind] = row.granted;
      }
      return state;
    },
  });
}
