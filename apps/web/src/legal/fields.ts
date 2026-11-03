import type { VerticalId } from '@shared/config/tenant-presets';
import { personalIdentity } from '@shared/legal/personalIdentity';
import { hasHealthDeclarations, insuranceStatus } from '@shared/legal/signed-template';

/**
 * Studio legal fields: what a studio fills in once (Settings → Legal, or the
 * onboarding wizard) and where each value lands in the legal templates under
 * docs/legal. A placeholder is the exact `[[…]]` text in a template; one field
 * may fill several placeholders (English and Hebrew, several documents).
 *
 * Adding a placeholder to a template? Map it here, or it shows as "missing".
 */

export type LegalDocId =
  | 'studio-privacy'
  | 'enrolment-terms'
  | 'accessibility'
  | 'cookies'
  | 'platform-terms'
  | 'dpa'
  | 'opalswift-privacy';

export type LegalFieldKind = 'text' | 'textarea' | 'email' | 'tel' | 'date' | 'number' | 'select' | 'checkbox';

export type LegalFieldSection = 'identity' | 'contacts' | 'enrolment' | 'photography' | 'retention';

export interface LegalFieldDef {
  key: string;
  section: LegalFieldSection;
  kind: LegalFieldKind;
  label: { en: string; he: string };
  hint?: { en: string; he: string };
  /** Shown only for these verticals; all verticals when omitted. */
  verticals?: VerticalId[];
  /** A sample answer shown under an empty field (legal tab: "for example …"). */
  example?: { en: string; he: string };
  /** Used when the studio leaves the field empty; the field then counts as filled. */
  defaultValue?: { en: string; he: string };
  options?: Array<{ value: string; label: { en: string; he: string } }>;
  /** Placeholders this field fills, per document. */
  placeholders: Partial<Record<LegalDocId, string[]>>;
  required?: boolean;
  /** Shown only when this holds for the details entered so far (e.g. not yet registered). */
  showWhen?: (profile: Record<string, string | undefined>) => boolean;
  /** Another label in that case (e.g. "Your full name" for an unregistered individual). */
  labelWhen?: { when: (profile: Record<string, string | undefined>) => boolean; label: { en: string; he: string } };
}

const notRegistered = (p: Record<string, string | undefined>) => p.business_status === 'not_registered';
const hasIsraeliId = (p: Record<string, string | undefined>) => notRegistered(p) && p.no_israeli_id !== 'yes';
const noIsraeliId = (p: Record<string, string | undefined>) => notRegistered(p) && p.no_israeli_id === 'yes';

export const BUSINESS_STATUSES = ['not_registered', 'osek_patur', 'osek_murshe', 'company'] as const;
export type BusinessStatus = (typeof BUSINESS_STATUSES)[number];

const DANCE_AND_GENERIC: VerticalId[] = ['dance-studio', 'generic', 'beautician'];
/** Studios that collect health declarations; only they see anything about insurance. */
const HEALTH_VERTICALS: VerticalId[] = (['dance-studio', 'generic', 'beautician', 'photographer'] as VerticalId[]).filter(
  (v) => hasHealthDeclarations(v),
);

export const LEGAL_FIELDS: LegalFieldDef[] = [
  // ---------------------------------------------------------------- identity
  {
    key: 'legal_name',
    section: 'identity',
    kind: 'text',
    required: true,
    label: { en: 'Legal name of the business', he: 'השם המשפטי של העסק' },
    labelWhen: {
      when: notRegistered,
      label: { en: 'Your full name (as on your ID)', he: 'שמך המלא (כפי שמופיע בתעודה)' },
    },
    hint: { en: 'As registered with the tax authority, or your full name.', he: 'כפי שרשום ברשות המסים, או שמך המלא.' },
    example: { en: "Dana Levi, or Harbour Dance Ltd", he: "דנה לוי, או מחול הנמל בע\"מ" },
    placeholders: {
      'studio-privacy': ['[[STUDIO LEGAL NAME]]', '[[השם המשפטי של הסטודיו]]'],
      'enrolment-terms': ['[[STUDIO LEGAL NAME]]', '[[השם המשפטי של הסטודיו]]'],
    },
  },
  {
    key: 'business_status',
    section: 'identity',
    kind: 'select',
    // Optional (owner decision): it never changes the documents' wording, it only prints as an identity fact.
    label: { en: 'Business status', he: 'מעמד העסק' },
    options: [
      { value: 'not_registered', label: { en: 'Not yet registered', he: 'טרם נרשם כעסק' } },
      { value: 'osek_patur', label: { en: 'Exempt dealer (עוסק פטור)', he: 'עוסק פטור' } },
      { value: 'osek_murshe', label: { en: 'Licensed dealer (עוסק מורשה)', he: 'עוסק מורשה' } },
      { value: 'company', label: { en: 'Company', he: 'חברה' } },
    ],
    placeholders: {},
  },
  {
    key: 'business_number',
    section: 'identity',
    kind: 'text',
    label: { en: 'Business number', he: 'מספר עוסק / ח.פ.' },
    example: { en: "514123456", he: "514123456" },
    showWhen: (p) => !notRegistered(p),
    placeholders: {},
  },
  // Not yet registered: the person's own identity stands in for a business number
  // (shared/legal/personalIdentity). One of the two is required to publish.
  {
    key: 'personal_id',
    section: 'identity',
    kind: 'text',
    label: { en: 'Your ID number (ת.ז.)', he: 'מספר תעודת הזהות שלך (ת.ז.)' },
    hint: {
      en: 'Shown in your published documents, because a studio that is not yet a registered business is run by you personally.',
      he: 'מופיע במסמכים שמתפרסמים, כי סטודיו שטרם נרשם כעסק מנוהל על ידך באופן אישי.',
    },
    example: { en: '123456782', he: '123456782' },
    showWhen: hasIsraeliId,
    placeholders: {},
  },
  {
    key: 'no_israeli_id',
    section: 'identity',
    kind: 'checkbox',
    label: { en: "I don't have an Israeli ID number", he: 'אין לי תעודת זהות ישראלית' },
    showWhen: notRegistered,
    placeholders: {},
  },
  {
    key: 'passport_number',
    section: 'identity',
    kind: 'text',
    label: { en: 'Passport number', he: 'מספר דרכון' },
    hint: { en: 'Shown in your published documents.', he: 'מופיע במסמכים שמתפרסמים.' },
    showWhen: noIsraeliId,
    placeholders: {},
  },
  {
    key: 'passport_country',
    section: 'identity',
    kind: 'text',
    label: { en: 'Country that issued the passport', he: 'המדינה שהנפיקה את הדרכון' },
    example: { en: 'France', he: 'צרפת' },
    showWhen: noIsraeliId,
    placeholders: {},
  },
  {
    key: 'address',
    section: 'identity',
    kind: 'text',
    required: true,
    label: { en: 'Business address', he: 'כתובת העסק' },
    example: { en: "12 Herzl St, Haifa", he: "רחוב הרצל 12, חיפה" },
    placeholders: {
      'studio-privacy': ['[[ADDRESS]]', '[[כתובת]]'],
      'enrolment-terms': ['[[ADDRESS]]', '[[כתובת]]'],
      accessibility: ['[[ADDRESS]]', '[[כתובת]]'],
    },
  },
  {
    key: 'phone',
    section: 'identity',
    kind: 'tel',
    required: true,
    label: { en: 'Business phone', he: 'טלפון העסק' },
    example: { en: "04-1234567", he: "04-1234567" },
    placeholders: {
      'studio-privacy': ['[[PHONE]]', '[[טלפון]]'],
      'enrolment-terms': ['[[PHONE]]', '[[טלפון]]'],
    },
  },
  {
    key: 'email',
    section: 'identity',
    kind: 'email',
    label: { en: 'Business email (defaults to the studio contact email)', he: 'דוא"ל העסק (ברירת מחדל: דוא"ל הקשר של הסטודיו)' },
    example: { en: "office@yourstudio.co.il", he: "office@yourstudio.co.il" },
    placeholders: {
      'enrolment-terms': ['[[EMAIL]]', '[[דוא"ל]]'],
    },
  },
  // ---------------------------------------------------------------- contacts
  {
    key: 'privacy_contact_name',
    section: 'contacts',
    kind: 'text',
    required: true,
    label: { en: 'Privacy contact (name or role)', he: 'איש/אשת קשר לפרטיות (שם או תפקיד)' },
    example: { en: "Dana Levi (the owner)", he: "דנה לוי (הבעלים)" },
    placeholders: { 'studio-privacy': ['[[NAME / ROLE]]', '[[שם / תפקיד]]'] },
  },
  {
    key: 'privacy_contact_email',
    section: 'contacts',
    kind: 'email',
    required: true,
    label: { en: 'Privacy contact email', he: 'דוא"ל לפניות פרטיות' },
    example: { en: "privacy@yourstudio.co.il", he: "privacy@yourstudio.co.il" },
    placeholders: { 'studio-privacy': ['[[EMAIL]]', '[[דוא"ל]]'] },
  },
  {
    key: 'accessibility_contact_name',
    section: 'contacts',
    kind: 'text',
    label: { en: 'Accessibility coordinator name', he: 'שם רכז/ת הנגישות' },
    placeholders: { accessibility: ['[[ACCESSIBILITY COORDINATOR NAME]]', '[[שם רכז/ת הנגישות]]'] },
  },
  {
    key: 'accessibility_contact_phone',
    section: 'contacts',
    kind: 'tel',
    label: { en: 'Accessibility coordinator phone', he: 'טלפון רכז/ת הנגישות' },
    placeholders: { accessibility: ['[[PHONE]]', '[[טלפון]]'] },
  },
  {
    key: 'accessibility_contact_email',
    section: 'contacts',
    kind: 'email',
    label: { en: 'Accessibility coordinator email', he: 'דוא"ל רכז/ת הנגישות' },
    placeholders: { accessibility: ['[[EMAIL]]', '[[דוא"ל]]'] },
  },
  {
    key: 'premises_accessibility',
    section: 'contacts',
    kind: 'textarea',
    label: { en: 'Accessibility of your premises (entrance, toilets, parking)', he: 'נגישות המקום (כניסה, שירותים, חניה)' },
    defaultValue: {
      en: "The premises' accessibility details are available from the studio.",
      he: 'פרטי נגישות המקום ניתנים לקבל מהסטודיו.',
    },
    placeholders: {
      accessibility: [
        '[[STUDIO: add a short paragraph about the premises, or "the premises\' accessibility details are available from the studio"]]',
        '[[סטודיו: להוסיף פסקה קצרה על המקום, או "פרטי נגישות המקום ניתנים לקבל מהסטודיו"]]',
      ],
    },
  },
  {
    key: 'payment_providers',
    section: 'contacts',
    kind: 'text',
    label: { en: 'Payment and invoicing providers you use', he: 'ספקי הסליקה והחשבוניות שבשימוש' },
    hint: { en: 'e.g. YPay, Grow, iCount', he: 'למשל YPay,‏ Grow,‏ iCount' },
    required: true,
    example: { en: "Grow, Bit", he: "Grow, ביט" },
    placeholders: { 'studio-privacy': ['[[LIST — e.g. YPay, Grow, iCount]]', '[[רשימה — למשל YPay,‏ Grow,‏ iCount]]'] },
  },
  // --------------------------------------------------------------- retention
  {
    key: 'health_retention_years',
    section: 'retention',
    kind: 'text',
    verticals: DANCE_AND_GENERIC,
    label: { en: 'Delete health details this long after the season', he: 'מחיקת פרטים רפואיים לאחר תום העונה, בתוך' },
    defaultValue: { en: '1 year', he: 'שנה' },
    placeholders: { 'studio-privacy': ['[[e.g. 1 year]]', '[[למשל שנה]]'] },
  },
  {
    key: 'marketing_proof_years',
    section: 'retention',
    kind: 'number',
    label: { en: 'Keep marketing-consent proof for (years after marketing stops)', he: 'שמירת תיעוד הסכמה לדיוור (שנים לאחר הפסקת הדיוור)' },
    defaultValue: { en: '3', he: '3' },
    placeholders: { 'studio-privacy': ['[[e.g. 3]]', '[[למשל 3]]'] },
  },
  // ------------------------------------------------------------- photography
  {
    key: 'gallery_service',
    section: 'photography',
    kind: 'text',
    verticals: ['photographer'],
    required: true,
    label: { en: 'Gallery service', he: 'שירות הגלריה' },
    hint: { en: 'e.g. Pixieset', he: 'למשל Pixieset' },
    example: { en: "Pixieset", he: "Pixieset" },
    placeholders: {
      'studio-privacy': [
        '[[GALLERY SERVICE — e.g. Pixieset]]',
        '[[GALLERY SERVICE]]',
        '[[שירות גלריה — למשל Pixieset]]',
        '[[שירות הגלריה]]',
      ],
    },
  },
  {
    key: 'image_retention',
    section: 'photography',
    kind: 'text',
    verticals: ['photographer'],
    label: { en: 'Keep final images after delivery for', he: 'שמירת התמונות הסופיות לאחר המסירה' },
    defaultValue: { en: '12 months', he: '12 חודשים' },
    placeholders: { 'studio-privacy': ['[[e.g. 12 months]]', '[[למשל 12 חודשים]]'] },
  },
  // --------------------------------------------------------------- enrolment
  {
    key: 'performance_details',
    section: 'enrolment',
    kind: 'text',
    verticals: DANCE_AND_GENERIC,
    label: { en: 'End-of-year performance (details, costume fees)', he: 'מופע סוף שנה (פרטים, עלות תלבושות)' },
    defaultValue: { en: 'details will be announced during the season', he: 'פרטים יימסרו במהלך העונה' },
    placeholders: { 'enrolment-terms': ['[[DETAILS / costume fees, if any]]', '[[פרטים / עלות תלבושות, אם יש]]'] },
  },
  {
    key: 'payment_methods',
    section: 'enrolment',
    kind: 'text',
    verticals: DANCE_AND_GENERIC,
    required: true,
    label: { en: 'Payment methods', he: 'אמצעי תשלום' },
    hint: { en: 'e.g. bank transfer, Bit, card through the payment page', he: 'למשל העברה בנקאית, ביט, כרטיס אשראי בעמוד התשלום' },
    example: { en: "Credit card, bank transfer", he: "כרטיס אשראי, העברה בנקאית" },
    placeholders: {
      'enrolment-terms': [
        '[[bank transfer / cash / Bit / card through the payment page]]',
        '[[העברה בנקאית / מזומן / ביט / כרטיס אשראי בעמוד התשלום]]',
      ],
    },
  },
  {
    key: 'max_makeups',
    section: 'enrolment',
    kind: 'number',
    verticals: DANCE_AND_GENERIC,
    label: { en: 'Make-up lessons allowed per season', he: 'מספר שיעורי השלמה בעונה' },
    defaultValue: { en: '3', he: '3' },
    placeholders: { 'enrolment-terms': ['[[MAX MAKE-UPS]]', '[[מספר השלמות]]'] },
  },
  {
    key: 'collection_age',
    section: 'enrolment',
    kind: 'number',
    verticals: DANCE_AND_GENERIC,
    label: { en: 'Children under this age must be collected at the door', he: 'ילדים מתחת לגיל זה נאספים בפתח הסטודיו' },
    defaultValue: { en: '10', he: '10' },
    placeholders: { 'enrolment-terms': ['[[AGE]]', '[[גיל]]'] },
  },
  // Insurance is optional and never blocks anything (owner decision). Only
  // studios with health declarations see it; the choice starts at "We don't
  // have insurance" (an unanswered choice counts the same), and the terms and
  // the health declaration then tell parents so (render.ts, shared signed-template).
  {
    key: 'insurance_status',
    section: 'enrolment',
    kind: 'select',
    verticals: HEALTH_VERTICALS,
    defaultValue: { en: 'none', he: 'none' },
    label: { en: 'Insurance', he: 'ביטוח' },
    options: [
      { value: 'insured', label: { en: 'We have insurance', he: 'יש לנו ביטוח' } },
      { value: 'none', label: { en: "We don't have insurance", he: 'אין לנו ביטוח' } },
    ],
    placeholders: {},
  },
  {
    key: 'insurance',
    section: 'enrolment',
    kind: 'text',
    verticals: HEALTH_VERTICALS,
    showWhen: (p) => insuranceStatus(p) === 'insured',
    label: { en: 'Insurance (insurer and policy type)', he: 'ביטוח (מבטח וסוג הפוליסה)' },
    hint: { en: 'e.g. third-party liability insurance with …', he: 'למשל ביטוח אחריות כלפי צד שלישי ב…' },
    example: { en: "Third-party liability, Harel", he: "ביטוח צד ג', הראל" },
    placeholders: {
      'enrolment-terms': [
        '[[third-party liability insurance — insurer / policy]]',
        '[[ביטוח אחריות כלפי צד שלישי — מבטח / פוליסה]]',
      ],
    },
  },
  {
    key: 'dress_code',
    section: 'enrolment',
    kind: 'text',
    verticals: DANCE_AND_GENERIC,
    label: { en: 'Dress code', he: 'לבוש' },
    defaultValue: { en: 'comfortable clothes suitable for movement', he: 'בגדים נוחים המתאימים לתנועה' },
    placeholders: { 'enrolment-terms': ['[[DRESS CODE]]', '[[קוד לבוש]]'] },
  },
  {
    key: 'watching_rule',
    section: 'enrolment',
    kind: 'text',
    verticals: DANCE_AND_GENERIC,
    label: { en: 'Watching classes', he: 'צפייה בשיעורים' },
    defaultValue: { en: 'only at open lessons', he: 'רק בשיעורים פתוחים' },
    placeholders: { 'enrolment-terms': ['[[e.g. only at open lessons]]', '[[למשל רק בשיעורים פתוחים]]'] },
  },
  {
    key: 'filming_rule',
    section: 'enrolment',
    kind: 'text',
    verticals: DANCE_AND_GENERIC,
    label: { en: 'Filming classes by parents', he: 'צילום שיעורים על ידי הורים' },
    defaultValue: {
      en: "not allowed, to protect other children's privacy",
      he: 'אסור, כדי לשמור על פרטיות ילדים אחרים',
    },
    placeholders: {
      'enrolment-terms': [
        "[[e.g. not allowed, to protect other children's privacy]]",
        '[[למשל אסור, כדי לשמור על פרטיות ילדים אחרים]]',
      ],
    },
  },
];

export function fieldsForVertical(vertical: VerticalId): LegalFieldDef[] {
  return LEGAL_FIELDS.filter((f) => !f.verticals || f.verticals.includes(vertical));
}

/** The label to show for a field, given the details entered so far. */
export function legalFieldLabel(
  f: LegalFieldDef,
  profile: Record<string, string | undefined>,
  lang: 'en' | 'he',
): string {
  return (f.labelWhen?.when(profile) ? f.labelWhen.label : f.label)[lang];
}

/** Fields to show for the details entered so far. */
export function visibleLegalFields(
  vertical: string | null | undefined,
  profile: Record<string, string | undefined>,
): LegalFieldDef[] {
  return fieldsForVertical(vertical as VerticalId).filter((f) => !f.showWhen || f.showWhen(profile));
}

/**
 * Required details the studio has not filled in yet: one list for both
 * Confirm (the legal pack) and Publish. A field with a default counts as
 * filled. Pass the profile with the studio's known details already merged in
 * (withLegalAutofill).
 *
 * Publish also needs, for a studio that is not yet a registered business,
 * the person behind it: their full name (not just the studio's name) and a
 * valid Israeli ID, or a passport number and country. Confirm does not.
 */
export function missingLegalDetails(
  vertical: string | null | undefined,
  profile: Record<string, string> | null | undefined,
  stage: 'confirm' | 'publish' = 'confirm',
  tenantName?: string | null,
): LegalFieldDef[] {
  const p = profile ?? {};
  const missing = fieldsForVertical(vertical as VerticalId).filter(
    (f) => f.required && !f.defaultValue && (!f.showWhen || f.showWhen(p)) && !(p[f.key] ?? '').trim(),
  );
  if (stage === 'publish' && p.business_status === 'not_registered') {
    const byKey = (k: string) => LEGAL_FIELDS.find((f) => f.key === k)!;
    const name = (p.legal_name ?? '').trim();
    if (name && tenantName && name.toLowerCase() === tenantName.trim().toLowerCase() && !missing.some((f) => f.key === 'legal_name')) {
      missing.push(byKey('legal_name'));
    }
    if (!personalIdentity(p)) {
      if (p.no_israeli_id === 'yes') {
        if (!(p.passport_number ?? '').trim()) missing.push(byKey('passport_number'));
        if (!(p.passport_country ?? '').trim()) missing.push(byKey('passport_country'));
      } else {
        missing.push(byKey('personal_id'));
      }
    }
  }
  return missing;
}
