import { SIGNED_TEMPLATE_FILES, SIGNED_TEMPLATE_SOURCES } from './signed-template-sources.js';
import { personalIdentity, personalIdentityText } from './personalIdentity.js';

export type LegalLang = 'he' | 'en';
type BusinessStatus = 'not_registered' | 'osek_patur' | 'osek_murshe' | 'company';

/**
 * Drop the drafting frame: the leading "Draft, not legal advice" quote block and
 * the notes after the last `---` (the same rule as the marketing site).
 */
export function stripDraftingFrame(raw: string): string {
  let text = raw.replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  let i = 0;
  while (i < lines.length && (lines[i].startsWith('>') || lines[i].trim() === '')) i += 1;
  text = lines.slice(i).join('\n');
  const cut = text.lastIndexOf('\n---\n');
  if (cut >= 0) text = text.slice(0, cut);
  return text.trimEnd() + '\n';
}

/**
 * The documents a studio's clients SIGN (consent_templates, shown in the
 * signing step as plain text): built from docs/legal 07b / 07c with the
 * studio's details and sensible defaults, and with no drafting notes.
 */
export type SignedDocId = keyof typeof SIGNED_TEMPLATE_FILES;

export const SIGNED_DOC_FILES: Record<SignedDocId, string> = SIGNED_TEMPLATE_FILES;

export type SignedAudience = 'child' | 'adult';

/** One form a studio gets: a document (plus, for agreements, its skin's add-on). */
export interface SignedFormSpec {
  key: string;
  doc: SignedDocId;
  addon?: SignedDocId;
  /** Health declarations: who signs this version (picked by the participant's age). */
  audience?: SignedAudience;
  title: Record<LegalLang, string>;
}

const HEALTH_FORMS: SignedFormSpec[] = [
  {
    key: 'health-child',
    doc: 'health-declaration-child',
    audience: 'child',
    title: { en: 'Health declaration (under 18)', he: 'הצהרת בריאות (מתחת לגיל 18)' },
  },
  {
    key: 'health-adult',
    doc: 'health-declaration-adult',
    audience: 'adult',
    title: { en: 'Health declaration (adults)', he: 'הצהרת בריאות (מבוגרים)' },
  },
];

/** The add-on documents a studio's agreement can carry (verticals.legal_addon). */
export const ADDON_DOCS = {
  photographer: 'addon-photographer',
  beautician: 'addon-beautician',
  coaching: 'addon-coaching',
} as const satisfies Record<string, SignedDocId>;
export type SignedAddon = keyof typeof ADDON_DOCS;

export function isSignedAddon(value: unknown): value is SignedAddon {
  return typeof value === 'string' && value in ADDON_DOCS;
}

/** What each add-on's agreement is called. */
const AGREEMENT_TITLES: Record<SignedAddon | 'none', Record<LegalLang, string>> = {
  photographer: { en: 'Photography services agreement', he: 'הסכם שירותי צילום' },
  beautician: { en: 'Treatment services agreement', he: 'הסכם שירותי טיפול' },
  coaching: { en: 'Sessions agreement', he: 'הסכם פגישות' },
  none: { en: 'Service agreement', he: 'הסכם שירות' },
};

/** The add-on each built-in skin has always had (a skin row's legal_addon says the same). */
const BUILT_IN_ADDONS: Record<string, SignedAddon> = { photographer: 'photographer', beautician: 'beautician' };

/** Today's rule, by skin: only dance studios' clients sign a health declaration. */
export function defaultHealthDeclarations(vertical: string | null | undefined): boolean {
  return vertical === 'dance-studio';
}

/** What decides a studio's forms. Anything not given follows its skin, as before. */
export interface SignedFormsScope {
  /** tenants.health_declaration (NULL: from the field). */
  healthDeclarations?: boolean | null;
  /** verticals.legal_addon of the studio's skin; undefined: the built-in skin's own. */
  legalAddon?: SignedAddon | null;
}

/**
 * The forms a studio's clients sign. A health declaration (both ages) when the
 * studio's clients sign one ("Clients sign a health declaration"; dance studios
 * by default). Every studio but a dance studio also has the service agreement,
 * with its field's add-on (photography, treatments, coaching), if any.
 */
export function signedFormsFor(vertical: string | null | undefined, scope: SignedFormsScope = {}): SignedFormSpec[] {
  const forms: SignedFormSpec[] = [];
  if (scope.healthDeclarations ?? defaultHealthDeclarations(vertical)) forms.push(...HEALTH_FORMS);
  if (vertical !== 'dance-studio') {
    const addon = scope.legalAddon === undefined ? BUILT_IN_ADDONS[vertical ?? ''] ?? null : scope.legalAddon;
    forms.push({
      key: 'agreement',
      doc: 'service-agreement',
      ...(addon ? { addon: ADDON_DOCS[addon] } : {}),
      title: AGREEMENT_TITLES[addon ?? 'none'],
    });
  }
  return forms;
}

/** The forms a studio type signs by default (unknown types: the general studio's). */
export function signedFormsForVertical(vertical: string | null | undefined): SignedFormSpec[] {
  return signedFormsFor(vertical);
}

/**
 * Whether the studio's clients sign a health declaration: the studio's setting,
 * or, when it has none, its field's default. Only those studios are asked about insurance.
 */
export function hasHealthDeclarations(vertical: string | null | undefined, setting?: boolean | null): boolean {
  return setting ?? defaultHealthDeclarations(vertical);
}

/**
 * The studio's insurance answer. Optional and never blocking: anything but an
 * explicit "We have insurance" counts as "We don't have insurance" (owner
 * decision), so an unanswered choice is never treated as insured.
 */
export function insuranceStatus(profile: Record<string, string | undefined> | null | undefined): 'insured' | 'none' {
  return profile?.insurance_status === 'insured' ? 'insured' : 'none';
}

/** What the service is called in the agreement, by studio type. */
const SERVICE_TYPE: Record<string, Record<LegalLang, string>> = {
  photographer: { en: 'photography', he: 'צילום' },
  beautician: { en: 'beauty treatment', he: 'טיפול יופי' },
  coaching: { en: 'coaching or tutoring', he: 'אימון או הוראה' },
};

export interface SignedTemplateContext {
  lang: LegalLang;
  tenantName: string;
  contactEmail: string;
  profile: Record<string, string | undefined>;
  /** tenants.skin (names the service in the agreement). */
  vertical?: string | null;
  /** The agreement's add-on (names the service; its own default numbers). Set by prepareSignedForm. */
  addon?: SignedAddon | null;
}


/** A blank the signer or the studio fills in. */
const BLANK = '______';

/** Notes for the studio or the lawyer: never shown to clients. */
const NOTE_PREFIXES = ['LAWYER', 'STUDIO:', 'PLACEHOLDERS', 'עו"ד', 'סטודיו:', 'ממלאי המקום'];

/** Placeholders that are dropped (with their parentheses, if any). */
const REMOVE = new Set(['@HANDLE', '@שם משתמש', '/ as files', '/ כקבצים', 'or "online", if applicable', 'או "מקוון", אם רלוונטי']);

/** Defaults for the commercial terms; the studio changes them in the Forms editor. */
const DEFAULTS: Record<string, string> = {
  // Price and payment
  '%': '30%',
  'before the service / on delivery / in N instalments': 'before the service',
  'לפני השירות / במסירה / ב-N תשלומים': 'לפני השירות',
  'cash / bank transfer / Bit': 'cash, bank transfer or Bit',
  'מזומן / העברה בנקאית / ביט': 'מזומן, העברה בנקאית או ביט',
  'WHAT IS INCLUDED: duration, number of sessions or items, what is delivered and how': 'what is described in the quote',
  'מה כלול: משך, מספר פגישות או פריטים, מה נמסר וכיצד': 'מה שמפורט בהצעת המחיר',
  // Cancellation (N days, M days)
  N: '30',
  M: '7',
  'N–M': '30–7',
  'deposit refunded less ₪X / deposit kept': 'the deposit is refunded in full',
  'המקדמה מוחזרת בניכוי X ₪ / המקדמה אינה מוחזרת': 'המקדמה מוחזרת במלואה',
  'the deposit is kept': 'the deposit is kept',
  'המקדמה אינה מוחזרת': 'המקדמה אינה מוחזרת',
  'deposit kept and X% of the balance is due': 'the deposit is kept and 50% of the balance is due',
  'המקדמה אינה מוחזרת ויש לשלם X% מהיתרה': 'המקדמה אינה מוחזרת ויש לשלם 50% מהיתרה',
  KM: '30',
  'ק"מ': '30',
  // Photography add-on
  'unless agreed': 'unless agreed in writing',
  'אלא אם סוכם': 'אלא אם סוכם בכתב',
  'on two cards / immediately after the shoot': 'immediately after the shoot',
  'בשני כרטיסים / מיד לאחר הצילום': 'מיד לאחר הצילום',
  // Beauty add-on
  'orally / in writing / in the app': 'orally or in writing',
  'בעל פה / בכתב / באפליקציה': 'בעל פה או בכתב',
  // Coaching add-on
  'in full in advance / in N instalments': 'in full in advance',
  'מראש במלואה / ב-N תשלומים': 'מראש במלואה',
  'in the app / by message': 'in the app or by message',
  'באפליקציה / בהודעה': 'באפליקציה או בהודעה',
  'unless both agree': 'unless both agree',
  'אלא אם שני הצדדים מסכימים': 'אלא אם שני הצדדים מסכימים',
  'is present / may be present': 'may be present',
  'נוכח/ת / רשאי/ת להיות נוכח/ת': 'רשאי/ת להיות נוכח/ת',
};

/** Placeholders whose text is the default ("or a free re-shoot, where possible"). */
const KEEP_INNER = /^(or |או |treatments that require it|טיפולים שמחייבים זאת)/;

/** Placeholders matched by their start (their text varies). */
const BY_PREFIX: Array<[RegExp, Record<LegalLang, string>]> = [
  [/^(PRICES|מחירים) —/, { en: 'as agreed in the quote', he: 'כפי שסוכם בהצעת המחיר' }],
  [/^(list|רשימה): /, { en: '', he: '' }],
  // Coaching add-on: where sessions happen.
  [/^(in person at |פנים אל פנים ב-)/, { en: 'in person or online by video', he: 'פנים אל פנים או מקוון בווידאו' }],
];

/** Optional alternatives that are dropped (the clause reads complete without them). */
const DROP_PREFIX = /^(\/ is charged at |\/ מחויבת ב-)/;

/** The photography add-on's [[NUMBER]]s after the business number: delivery days, gallery months, archive months. */
const NUMBER_DEFAULTS = ['30', '6', '12'];
/** The coaching add-on's: session minutes, sessions in a package, months it is valid, extension months. */
const NUMBER_DEFAULTS_BY_ADDON: Partial<Record<SignedAddon, string[]>> = { coaching: ['60', '10', '6', '3'] };

function businessKind(status: BusinessStatus | undefined, lang: LegalLang): string | null {
  const he = lang === 'he';
  switch (status) {
    case 'osek_patur':
      return 'עוסק פטור';
    case 'osek_murshe':
      return 'עוסק מורשה';
    case 'company':
      return he ? 'חברה' : 'company';
    case 'not_registered':
      return he ? 'יחיד/ה, טרם נרשם/ה כעסק' : 'individual, not yet a registered business';
    default:
      return null;
  }
}

/** Tidy headings written for the studio ("Privacy notice (shown above the form)"). */
function tidyHeadings(text: string): string {
  return text.replace(/^(#{1,6} [^(\n]+?)\s*\((shown above the form|מוצגת מעל הטופס)\)/gm, '$1');
}

/** Drop lines that describe how the form is signed in the app (the app does that). */
function dropSigningInstructions(text: string): string {
  return text.replace(/^\*\*(Signature|חתימה):\*\*.*$\n?/gm, '');
}

/** Markdown → the plain text the signing step shows (it renders text, not markdown). */
export function markdownToPlainText(md: string): string {
  return md
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1$2')
    .replace(/^\s*> ?/gm, '')
    .replace(/^---$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The template source for a document and language (bundled from docs/legal). */
export function signedTemplateSource(doc: SignedDocId, lang: LegalLang): string {
  return SIGNED_TEMPLATE_SOURCES[doc][lang];
}

/** One filled form, ready to store as an active consent template. */
export interface StudioSignedForm {
  key: string;
  name: string;
  content: string;
  audience: SignedAudience | null;
}

/** The forms for a studio, filled: what provisioning stores as its active consent templates. */
export function studioSignedForms(
  vertical: string | null | undefined,
  ctx: SignedTemplateContext,
  scope: SignedFormsScope = {},
): StudioSignedForm[] {
  return signedFormsFor(vertical, scope).map((form) => ({
    key: form.key,
    name: form.title[ctx.lang],
    audience: form.audience ?? null,
    content: prepareSignedForm(form, { ...ctx, vertical }),
  }));
}

/** A form's text: the document (and its add-on), filled with the studio's details. */
export function prepareSignedForm(form: SignedFormSpec, ctx: SignedTemplateContext): string {
  const parts = [stripDraftingFrame(signedTemplateSource(form.doc, ctx.lang))];
  if (form.addon) parts.push(stripDraftingFrame(signedTemplateSource(form.addon, ctx.lang)));
  const addon = (Object.keys(ADDON_DOCS) as SignedAddon[]).find((k) => ADDON_DOCS[k] === form.addon) ?? null;
  return fillSignedText(parts.join('\n\n'), { ...ctx, addon });
}

/**
 * "We don't have insurance" (legal_profile.insurance_status other than 'insured'): the
 * health declaration's Declaration list tells the signer so, as part of the
 * text they sign (sealed with it). No extra step. Awaiting lawyer review.
 */
export const NO_INSURANCE_DECLARATION: Record<LegalLang, string> = {
  en: 'I know that the studio does not currently hold insurance covering participants, and that personal accident insurance is recommended.',
  he: 'ידוע לי שלסטודיו אין כרגע ביטוח המכסה משתתפים, ושמומלץ לעשות ביטוח תאונות אישיות.',
};

function addInsuranceDisclosure(markdown: string, ctx: SignedTemplateContext): string {
  if (insuranceStatus(ctx.profile) === 'insured') return markdown;
  return markdown.replace(
    /(## 2\. (?:Declaration|הצהרה)\n\n(?:- .*\n)+)/,
    (list) => `${list}- ${NO_INSURANCE_DECLARATION[ctx.lang]}\n`,
  );
}

/** Fill a signed document's placeholders and turn it into plain text. */
export function fillSignedText(markdown: string, ctx: SignedTemplateContext): string {
  let text = dropSigningInstructions(tidyHeadings(addInsuranceDisclosure(markdown, ctx)));

  const p = ctx.profile;
  const value = (v: string | undefined) => (v ?? '').trim();
  const status = p.business_status as BusinessStatus | undefined;
  const legalName = value(p.legal_name) || ctx.tenantName;
  const email = value(p.email) || ctx.contactEmail;
  const serviceType =
    SERVICE_TYPE[ctx.addon ?? ctx.vertical ?? '']?.[ctx.lang] ?? (ctx.lang === 'he' ? 'השירות' : 'the service');
  const numberDefaults = (ctx.addon && NUMBER_DEFAULTS_BY_ADDON[ctx.addon]) || NUMBER_DEFAULTS;
  const retention = value(p.health_retention_years);
  // Neutral for any business status: VAT and tax documents are the invoicing provider's job.
  const vat =
    ctx.lang === 'he'
      ? '(המחיר כפי שמוצג; מע"מ ומסמכי מס, ככל שנדרשים, מונפקים דרך ספק החשבוניות כנדרש בחוק)'
      : '(prices as shown; any VAT and tax documents are issued through the invoicing provider, as the law requires)';
  const studio: Record<string, string> = {
    'STUDIO NAME': ctx.tenantName,
    'שם הסטודיו': ctx.tenantName,
    'PROVIDER LEGAL NAME': legalName,
    'PHOTOGRAPHER LEGAL NAME': legalName,
    'שם משפטי': legalName,
    ADDRESS: value(p.address),
    'כתובת': value(p.address),
    CITY: value(p.city),
    'עיר': value(p.city),
    PHONE: value(p.phone),
    'טלפון': value(p.phone),
    EMAIL: email,
    'דוא"ל': email,
    'GALLERY SERVICE': value(p.gallery_service) || (ctx.lang === 'he' ? 'שירות גלריה מקוון' : 'an online gallery service'),
    'שירות גלריה': value(p.gallery_service) || 'שירות גלריה מקוון',
    '1 year': retention ? `${retention} year(s)` : '1 year',
    'שנה': retention ? `${retention} שנים` : 'שנה',
    'incl. VAT / no VAT — עוסק פטור': vat,
    'כולל מע"מ / ללא מע"מ — עוסק פטור': vat,
  };
  // The provider's identity line: an unregistered provider has no business number to print.
  let numberRemoved = false;
  if (status === 'not_registered') {
    const before = text;
    text = text.replace(/\[\[(עוסק פטור \/ עוסק מורשה \/ (company|חברה))\]\] (no\.|מס') \[\[(NUMBER|מספר)\]\]/g, '[[$1]]');
    numberRemoved = text !== before;
  }
  for (const key of ['ADDRESS', 'כתובת', 'PHONE', 'טלפון', 'EMAIL', 'דוא"ל']) studio[key] = studio[key] || BLANK;
  // Not yet registered: the person's ID (or passport) stands in for the business number.
  const identity = status === 'not_registered' ? personalIdentity(p) : null;
  const baseKind = businessKind(status, ctx.lang);
  const kind = baseKind && identity ? `${baseKind}; ${personalIdentityText(identity, ctx.lang)}` : baseKind;
  if (kind) {
    studio['עוסק פטור / עוסק מורשה / company'] = kind;
    studio['עוסק פטור / עוסק מורשה / חברה'] = kind;
  }

  let numberIndex = 0;
  let firstNumber = !numberRemoved;

  const fill = (inner: string): string => {
    if (NOTE_PREFIXES.some((n) => inner.startsWith(n))) return '';
    if (REMOVE.has(inner)) return '';
    if (inner in studio) return studio[inner];
    if (inner.startsWith('SERVICE TYPE') || inner.startsWith('סוג השירות')) return serviceType;
    if (DEFAULTS[inner] !== undefined) return DEFAULTS[inner];
    if (DROP_PREFIX.test(inner)) return '';
    // The package extension: kept, as an option (the add-on's drafting note recommends it).
    if (/^\/ (may be extended once by|ניתן להאריך פעם אחת ב-)/.test(inner)) {
      return ctx.lang === 'he' ? `או ש${inner.slice(2)}` : `or ${inner.slice(2)}`;
    }
    for (const [re, out] of BY_PREFIX) {
      if (re.test(inner)) return out[ctx.lang] || inner.replace(re, '').replace(/,? (and so on|וכד')$/, '');
    }
    if (KEEP_INNER.test(inner)) return inner;
    if (inner === 'NUMBER' || inner === 'מספר') {
      if (firstNumber) {
        firstNumber = false;
        return value(p.business_number) || BLANK;
      }
      return numberDefaults[numberIndex++] ?? BLANK;
    }
    // Plain numbers and periods ("14", "6 months", "48") are already the default.
    if (/^[\d–-]+( days| months| יום| חודשים)?$/.test(inner)) return inner;
    return BLANK;
  };

  // Placeholders can nest ("[[PRICES — … beyond [[KM]] km …]]"): fill the innermost first.
  for (let pass = 0; pass < 4 && text.includes('[['); pass += 1) {
    // Notes and removed placeholders inside parentheses drop the parentheses too.
    text = text.replace(/\s*\(\[\[([^[\]]+)\]\]\)/g, (whole, inner: string) =>
      NOTE_PREFIXES.some((n) => inner.startsWith(n)) || REMOVE.has(inner) ? '' : whole,
    );
    text = text.replace(/(\s?)\[\[([^[\]]*)\]\]/g, (_whole, lead: string, inner: string) => {
      const out = fill(inner);
      return out ? lead + out : '';
    });
  }

  return markdownToPlainText(text);
}
