import { Marked, type Tokens } from 'marked';
import type { VerticalId } from '@shared/config/tenant-presets';
import { LEGAL_FIELDS, type BusinessStatus, type LegalDocId } from './fields';
import { stripDraftingFrame } from '@shared/legal/signed-template';

export type LegalLang = 'he' | 'en';

export interface LegalRenderContext {
  doc: LegalDocId;
  lang: LegalLang;
  vertical: VerticalId;
  tenantName: string;
  contactEmail: string;
  profile: Record<string, string | undefined>;
  updatedAt: string | null;
}

export interface PreparedLegalDoc {
  markdown: string;
  /** Field keys (or raw placeholder text, for unmapped ones) still to fill. */
  missing: string[];
  /** Labels of the missing placeholders, in token order (for highlighting). */
  missingLabels: string[];
  /** Stable short hash of the final text; recorded with every acceptance. */
  version: string;
}

/** Document id → template file prefix in docs/legal. */
export const LEGAL_DOC_FILES: Record<LegalDocId, string> = {
  'platform-terms': '01-platform-terms',
  dpa: '02-dpa',
  'studio-privacy': '03-studio-privacy-policy',
  'opalswift-privacy': '04-opalswift-privacy-policy',
  cookies: '05-cookie-storage-notice',
  accessibility: '06-accessibility-statement',
  'enrolment-terms': '07a-dance-enrolment-terms',
};

const FILE_PREFIX_TO_DOC: Record<string, LegalDocId> = {
  '01': 'platform-terms',
  '02': 'dpa',
  '03': 'studio-privacy',
  '04': 'opalswift-privacy',
  '05': 'cookies',
  '06': 'accessibility',
  '07a': 'enrolment-terms',
};

// Internal drafting notes: removed from the published text.
const NOTE_PREFIXES = [
  'LAWYER', 'VERIFY', 'CHECK', 'STUDIO: confirm', 'PHOTOGRAPHER:', 'If a season discount',
  'if available', 'and password',
  'עו"ד', 'לאמת', 'לבדוק', 'סטודיו: לאשר', 'צלם/ת:', 'אם ניתנה הנחה', 'אם זמין', 'וסיסמה',
];

const VARIANT_A = ['[[A: DANCE SCHOOL — keep this section]]', '[[א: בית ספר למחול — להשאיר חלק זה]]'];
const VARIANT_B = ['[[B: PHOTOGRAPHER — keep this section]]', '[[ב: צילום — להשאיר חלק זה]]'];

const FIXED_TEXT: Record<string, string> = {
  '[[ACCOUNTANT: usually 7 years]]': 'usually 7 years',
  '[[רו"ח: בדרך כלל 7 שנים]]': 'בדרך כלל 7 שנים',
  '[[DATE / NOT YET DONE]]': 'not yet done',
  '[[תאריך / טרם בוצעה]]': 'טרם בוצעה',
};

const MISSING_TOKEN = 'LEGALMISSINGTOKEN';
const DROP_LINE_TOKEN = 'LEGALDROPLINETOKEN';

function isNote(inner: string): boolean {
  return NOTE_PREFIXES.some((p) => inner.startsWith(p));
}

/** Escape a studio-entered value so it can't become markdown or HTML. */
export function escapeMarkdownValue(value: string): string {
  return value
    .replace(/[\r\n]+/g, ' ')
    .replace(/([\\`*_{}[\]()#+\-.!|<>&~])/g, '\\$1');
}

/** Drafting frame removal is shared with the Edge Functions. */
export { stripDraftingFrame };

function applyVariant(text: string, vertical: VerticalId): string {
  const find = (markers: string[]) => {
    for (const m of markers) {
      const idx = text.indexOf(m);
      if (idx >= 0) return idx;
    }
    return -1;
  };
  const aIdx = find(VARIANT_A);
  const bIdx = find(VARIANT_B);
  if (aIdx < 0 || bIdx < 0 || bIdx < aIdx) return text;
  const next = text.indexOf('\n## ', bIdx);
  const endIdx = next >= 0 ? next + 1 : text.length;

  const keepA = vertical === 'dance-studio';
  const keepB = vertical === 'photographer';
  let out =
    text.slice(0, aIdx) +
    (keepA ? text.slice(aIdx, bIdx) : '') +
    (keepB ? text.slice(bIdx, endIdx) : '') +
    text.slice(endIdx);
  for (const m of [...VARIANT_A, ...VARIANT_B]) out = out.split(m).join('');
  return out.replace(/\n{3,}/g, '\n\n');
}

function rewriteDocLinks(text: string): string {
  return text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, label: string, href: string) => {
    if (/^(https?:|mailto:|\/)/.test(href)) return whole;
    const m = href.match(/^(\d\d[a-z]?)-[^#]*\.md(#.*)?$/);
    if (m && FILE_PREFIX_TO_DOC[m[1]]) return `[${label}](/legal/${FILE_PREFIX_TO_DOC[m[1]]})`;
    return label; // internal doc (checklist, security procedure …): keep the text only
  });
}

function formatDate(iso: string | null, lang: LegalLang): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return iso ?? '';
  return new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-GB', {
    timeZone: 'Asia/Jerusalem',
    dateStyle: 'long',
  }).format(d);
}

function businessLine(status: BusinessStatus | undefined, num: string, lang: LegalLang): string | null {
  if (!status) return null;
  const he = lang === 'he';
  switch (status) {
    case 'not_registered':
      return he ? 'יחיד/ה, טרם נרשם/ה כעסק' : 'individual, not yet a registered business';
    case 'osek_patur':
      return num ? (he ? `עוסק פטור מס' ${num}` : `עוסק פטור (exempt dealer) no. ${num}`) : null;
    case 'osek_murshe':
      return num ? (he ? `עוסק מורשה מס' ${num}` : `עוסק מורשה (licensed dealer) no. ${num}`) : null;
    case 'company':
      return num ? (he ? `חברה מס' ${num}` : `company no. ${num}`) : null;
    default:
      return null;
  }
}

/** Values derived from several fields or from the tenant itself. */
function derivedValues(ctx: LegalRenderContext): Record<string, string | null> {
  const he = ctx.lang === 'he';
  const p = ctx.profile;
  const status = p.business_status as BusinessStatus | undefined;
  const num = (p.business_number ?? '').trim();
  const email = (p.email ?? '').trim() || ctx.contactEmail;
  const phone = (p.phone ?? '').trim();
  const vat =
    status === 'osek_patur'
      ? he ? 'ללא מע"מ (עוסק פטור)' : 'no VAT charged (עוסק פטור)'
      : status === 'osek_murshe' || status === 'company'
        ? he ? 'כולל מע"מ' : 'incl. VAT'
        : status === 'not_registered' ? '' : null;
  const date = formatDate(ctx.updatedAt, ctx.lang);
  return {
    '[[STUDIO NAME]]': ctx.tenantName,
    '[[שם הסטודיו]]': ctx.tenantName,
    '[[DATE]]': date,
    '[[תאריך]]': date,
    '[[BUSINESS STATUS & NO. — e.g. עוסק פטור no. …, or "individual, not yet a registered business"]]': businessLine(status, num, ctx.lang),
    '[[מעמד ומספר עוסק — למשל עוסק פטור מס\' …, או "יחיד/ה, טרם נרשם/ה כעסק"]]': businessLine(status, num, ctx.lang),
    '[[ID / BUSINESS NO. — or "not yet a registered business"]]':
      status === 'not_registered' ? 'not yet a registered business' : num || null,
    '[[ת"ז / מס\' עוסק — או "טרם נרשם כעסק"]]': status === 'not_registered' ? 'טרם נרשם כעסק' : num || null,
    '[[incl. VAT / no VAT charged (עוסק פטור)]]': vat,
    '[[כולל מע"מ / ללא מע"מ (עוסק פטור)]]': vat,
    '[[EMAIL / PHONE]]': phone ? `${email} / ${phone}` : email,
    '[[דוא"ל / טלפון]]': phone ? `${email} / ${phone}` : email,
  };
}

/** Receipts sentence: only a registered business can promise receipts. */
function receiptsValue(ctx: LegalRenderContext): string | null {
  const status = ctx.profile.business_status;
  if (!status || status === 'not_registered') return null;
  return ctx.lang === 'he' ? 'על כל תשלום תונפק קבלה.' : 'We issue a receipt for every payment.';
}

/** Per-field fallbacks so a statement still reads well before every field is set. */
function fieldFallback(key: string, ctx: LegalRenderContext): string | undefined {
  const p = ctx.profile;
  switch (key) {
    case 'email':
    case 'privacy_contact_email':
    case 'accessibility_contact_email':
      return (p.email ?? '').trim() || ctx.contactEmail || undefined;
    case 'accessibility_contact_name':
      return (p.legal_name ?? '').trim() || ctx.tenantName || undefined;
    case 'accessibility_contact_phone':
      return (p.phone ?? '').trim() || undefined;
    default:
      return undefined;
  }
}

function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function legalTextVersion(text: string): string {
  return `${fnv1a(text)}-${text.length.toString(36)}`;
}

/**
 * Turn a docs/legal template into the studio's published markdown: drop the
 * drafting frame and notes, keep the right vertical variant, fill placeholders.
 * Unfilled placeholders become MISSING tokens (rendered highlighted).
 */
export function prepareLegalMarkdown(raw: string, ctx: LegalRenderContext): PreparedLegalDoc {
  let text = stripDraftingFrame(raw);
  text = applyVariant(text, ctx.vertical);
  text = rewriteDocLinks(text);

  const derived = derivedValues(ctx);
  const missing = new Set<string>();
  const missingTexts: string[] = [];

  // Map placeholder text → field (scoped to this document).
  const byPlaceholder = new Map<string, (typeof LEGAL_FIELDS)[number]>();
  for (const f of LEGAL_FIELDS) {
    for (const ph of f.placeholders[ctx.doc] ?? []) byPlaceholder.set(ph, f);
  }

  // Notes inside parentheses first: " ([[LAWYER: …]])" → "".
  text = text.replace(/\s*\(\[\[([^\]]+)\]\]\)/g, (whole, inner: string) => (isNote(inner) ? '' : whole));

  text = text.replace(/(\s?)\[\[([^\]]+)\]\]/g, (_whole, lead: string, inner: string) => {
    const ph = `[[${inner}]]`;
    if (isNote(inner)) return '';
    if (FIXED_TEXT[ph] !== undefined) return lead + FIXED_TEXT[ph];
    if (/^\d+( days| יום)?$/.test(inner)) return lead + inner;

    if (ph.startsWith('[[RECEIPTS:') || ph.startsWith('[[קבלות:')) {
      const r = receiptsValue(ctx);
      if (r) return lead + r;
      missing.add('receipts');
      missingTexts.push(ctx.lang === 'he' ? 'קבלות (העסק טרם נרשם)' : 'receipts (business not registered)');
      return `${lead}${MISSING_TOKEN}${missingTexts.length - 1}X`;
    }

    if (ph in derived) {
      const v = derived[ph];
      if (v !== null && v !== undefined) return v === '' ? '' : lead + escapeMarkdownValue(v);
    }

    const field = byPlaceholder.get(ph);
    if (field?.verticals && !field.verticals.includes(ctx.vertical)) {
      // e.g. "the gallery service" line in a dance school's policy.
      return DROP_LINE_TOKEN;
    }
    if (field) {
      const raw = (ctx.profile[field.key] ?? '').trim() || fieldFallback(field.key, ctx);
      const value = raw && field.kind === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? formatDate(`${raw}T12:00:00Z`, ctx.lang) : raw;
      if (value) return lead + escapeMarkdownValue(value);
      if (field.defaultValue) return lead + escapeMarkdownValue(field.defaultValue[ctx.lang]);
      missing.add(field.key);
      missingTexts.push(field.label[ctx.lang]);
      return `${lead}${MISSING_TOKEN}${missingTexts.length - 1}X`;
    }

    // Derived placeholder without a value (e.g. business number not set yet).
    if (ph in derived) {
      const key = ph.includes('VAT') || ph.includes('מע"מ') || !ctx.profile.business_status ? 'business_status' : 'business_number';
      missing.add(key);
      missingTexts.push(LEGAL_FIELDS.find((f) => f.key === key)?.label[ctx.lang] ?? inner);
    } else {
      missing.add(ph);
      missingTexts.push(inner);
    }
    return `${lead}${MISSING_TOKEN}${missingTexts.length - 1}X`;
  });

  const markdown = text
    .split('\n')
    .filter((line) => !line.includes(DROP_LINE_TOKEN))
    .join('\n')
    .replace(/[ \t]+\n/g, '\n');
  return {
    markdown,
    missing: [...missing],
    missingLabels: missingTexts,
    version: legalTextVersion(markdown),
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const marked = new Marked({
  gfm: true,
  async: false,
  renderer: {
    // Templates never need raw HTML; escape anything that looks like it.
    html(token: Tokens.HTML | Tokens.Tag) {
      return escapeHtml(token.text);
    },
    link(this: unknown, token: Tokens.Link) {
      const href = token.href ?? '';
      const safe = /^(https?:|mailto:|\/)/.test(href) ? href : '#';
      const external = /^https?:/.test(safe);
      const text = escapeHtml(token.text);
      return `<a href="${escapeHtml(safe)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${text}</a>`;
    },
  },
});

/** Markdown → HTML for the legal page. Missing placeholders are highlighted. */
export function renderLegalHtml(doc: Pick<PreparedLegalDoc, 'markdown' | 'missingLabels'>): string {
  const labels = doc.missingLabels;
  const html = marked.parse(doc.markdown) as string;
  return html.replace(new RegExp(`${MISSING_TOKEN}(\\d+)X`, 'g'), (_m, n: string) => {
    const label = labels[Number(n)] ?? '…';
    return `<mark class="legal-missing">[${escapeHtml(label)}]</mark>`;
  });
}
