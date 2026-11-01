import type { VerticalId } from '@shared/config/tenant-presets';

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

export type LegalFieldKind = 'text' | 'textarea' | 'email' | 'tel' | 'date' | 'number' | 'select';

export type LegalFieldSection = 'identity' | 'contacts' | 'enrolment' | 'photography' | 'retention';

export interface LegalFieldDef {
  key: string;
  section: LegalFieldSection;
  kind: LegalFieldKind;
  label: { en: string; he: string };
  hint?: { en: string; he: string };
  /** Shown only for these verticals; all verticals when omitted. */
  verticals?: VerticalId[];
  /** Used when the studio leaves the field empty; the field then counts as filled. */
  defaultValue?: { en: string; he: string };
  options?: Array<{ value: string; label: { en: string; he: string } }>;
  /** Placeholders this field fills, per document. */
  placeholders: Partial<Record<LegalDocId, string[]>>;
  required?: boolean;
}

export const BUSINESS_STATUSES = ['not_registered', 'osek_patur', 'osek_murshe', 'company'] as const;
export type BusinessStatus = (typeof BUSINESS_STATUSES)[number];

const DANCE_AND_GENERIC: VerticalId[] = ['dance-studio', 'generic', 'beautician'];

export const LEGAL_FIELDS: LegalFieldDef[] = [
  // ---------------------------------------------------------------- identity
  {
    key: 'legal_name',
    section: 'identity',
    kind: 'text',
    required: true,
    label: { en: 'Legal name of the business', he: 'השם המשפטי של העסק' },
    hint: { en: 'As registered with the tax authority, or your full name.', he: 'כפי שרשום ברשות המסים, או שמך המלא.' },
    placeholders: {
      'studio-privacy': ['[[STUDIO LEGAL NAME]]', '[[השם המשפטי של הסטודיו]]'],
      'enrolment-terms': ['[[STUDIO LEGAL NAME]]', '[[השם המשפטי של הסטודיו]]'],
    },
  },
  {
    key: 'business_status',
    section: 'identity',
    kind: 'select',
    required: true,
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
    label: { en: 'ID / business number', he: 'ת"ז / מספר עוסק' },
    hint: { en: 'Leave empty if not yet registered.', he: 'אפשר להשאיר ריק אם העסק טרם נרשם.' },
    placeholders: {},
  },
  {
    key: 'address',
    section: 'identity',
    kind: 'text',
    required: true,
    label: { en: 'Business address', he: 'כתובת העסק' },
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
    placeholders: { 'studio-privacy': ['[[NAME / ROLE]]', '[[שם / תפקיד]]'] },
  },
  {
    key: 'privacy_contact_email',
    section: 'contacts',
    kind: 'email',
    required: true,
    label: { en: 'Privacy contact email', he: 'דוא"ל לפניות פרטיות' },
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
    key: 'season_name',
    section: 'enrolment',
    kind: 'text',
    verticals: DANCE_AND_GENERIC,
    required: true,
    label: { en: 'Season name', he: 'שם העונה' },
    hint: { en: 'e.g. 2026–2027', he: 'למשל תשפ"ז / 2026–2027' },
    placeholders: { 'enrolment-terms': ['[[SEASON NAME, e.g. 2026–2027]]', '[[שם העונה, למשל תשפ"ז / 2026–2027]]'] },
  },
  {
    key: 'season_start',
    section: 'enrolment',
    kind: 'date',
    verticals: DANCE_AND_GENERIC,
    required: true,
    label: { en: 'Season start date', he: 'תאריך תחילת העונה' },
    placeholders: { 'enrolment-terms': ['[[START DATE]]', '[[תאריך התחלה]]'] },
  },
  {
    key: 'season_end',
    section: 'enrolment',
    kind: 'date',
    verticals: DANCE_AND_GENERIC,
    required: true,
    label: { en: 'Season end date', he: 'תאריך סיום העונה' },
    placeholders: { 'enrolment-terms': ['[[END DATE]]', '[[תאריך סיום]]'] },
  },
  {
    key: 'lesson_count',
    section: 'enrolment',
    kind: 'number',
    verticals: DANCE_AND_GENERIC,
    required: true,
    label: { en: 'Number of lessons in the season (about)', he: 'מספר השיעורים בעונה (בערך)' },
    placeholders: { 'enrolment-terms': ['[[NUMBER OF LESSONS]]', '[[מספר שיעורים]]'] },
  },
  {
    key: 'holidays',
    section: 'enrolment',
    kind: 'text',
    verticals: DANCE_AND_GENERIC,
    label: { en: 'No classes on', he: 'אין שיעורים ב…' },
    defaultValue: {
      en: 'Israeli public holidays and school holidays, as listed in the studio calendar',
      he: 'חגים וחופשות, כמפורט בלוח השנה של הסטודיו',
    },
    placeholders: {
      'enrolment-terms': [
        '[[HOLIDAYS — e.g. Israeli public holidays and school holidays as listed in the studio calendar]]',
        '[[חגים — למשל חגים וחופשות כמפורט בלוח השנה של הסטודיו]]',
      ],
    },
  },
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
    key: 'season_price',
    section: 'enrolment',
    kind: 'text',
    verticals: DANCE_AND_GENERIC,
    required: true,
    label: { en: 'Price for the season (₪)', he: 'מחיר לעונה (₪)' },
    placeholders: { 'enrolment-terms': ['[[SEASON PRICE ₪]]', '[[מחיר לעונה ₪]]'] },
  },
  {
    key: 'monthly_price',
    section: 'enrolment',
    kind: 'text',
    verticals: DANCE_AND_GENERIC,
    required: true,
    label: { en: 'Monthly price (₪)', he: 'מחיר חודשי (₪)' },
    placeholders: { 'enrolment-terms': ['[[MONTHLY PRICE ₪]]', '[[מחיר חודשי ₪]]'] },
  },
  {
    key: 'month_count',
    section: 'enrolment',
    kind: 'number',
    verticals: DANCE_AND_GENERIC,
    required: true,
    label: { en: 'Number of monthly payments', he: 'מספר התשלומים החודשיים' },
    placeholders: { 'enrolment-terms': ['[[NUMBER OF MONTHS]]', '[[מספר חודשים]]'] },
  },
  {
    key: 'registration_fee',
    section: 'enrolment',
    kind: 'text',
    verticals: DANCE_AND_GENERIC,
    label: { en: 'Registration fee', he: 'דמי רישום' },
    defaultValue: { en: 'none', he: 'אין' },
    placeholders: { 'enrolment-terms': ['[[₪ / none]]', '[[₪ / אין]]'] },
  },
  {
    key: 'sibling_discount',
    section: 'enrolment',
    kind: 'text',
    verticals: DANCE_AND_GENERIC,
    label: { en: 'Sibling discount', he: 'הנחת אחים' },
    defaultValue: { en: 'none', he: 'אין' },
    placeholders: { 'enrolment-terms': ['[[SIBLING DISCOUNT]]', '[[הנחת אחים]]'] },
  },
  {
    key: 'payment_methods',
    section: 'enrolment',
    kind: 'text',
    verticals: DANCE_AND_GENERIC,
    required: true,
    label: { en: 'Payment methods', he: 'אמצעי תשלום' },
    hint: { en: 'e.g. bank transfer, Bit, card through the payment page', he: 'למשל העברה בנקאית, ביט, כרטיס אשראי בעמוד התשלום' },
    placeholders: {
      'enrolment-terms': [
        '[[bank transfer / cash / Bit / card through the payment page]]',
        '[[העברה בנקאית / מזומן / ביט / כרטיס אשראי בעמוד התשלום]]',
      ],
    },
  },
  {
    key: 'payment_dates',
    section: 'enrolment',
    kind: 'text',
    verticals: DANCE_AND_GENERIC,
    required: true,
    label: { en: 'Payment dates', he: 'מועדי תשלום' },
    hint: { en: 'e.g. on the 1st of each month', he: 'למשל ב-1 לכל חודש' },
    placeholders: {
      'enrolment-terms': [
        '[[e.g. on the 1st of each month / in advance for the season]]',
        '[[למשל ב-1 לכל חודש / מראש לכל העונה]]',
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
  {
    key: 'insurance',
    section: 'enrolment',
    kind: 'text',
    verticals: DANCE_AND_GENERIC,
    required: true,
    label: { en: 'Insurance (insurer and policy type)', he: 'ביטוח (מבטח וסוג הפוליסה)' },
    hint: { en: 'e.g. third-party liability insurance with …', he: 'למשל ביטוח אחריות כלפי צד שלישי ב…' },
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
