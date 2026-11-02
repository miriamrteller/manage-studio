/* @ts-self-types="./signed-template.d.ts" */
import { SIGNED_TEMPLATE_FILES, SIGNED_TEMPLATE_SOURCES } from './signed-template-sources.js';
/**
 * Drop the drafting frame: the leading "Draft, not legal advice" quote block and
 * the notes after the last `---` (the same rule as the marketing site).
 */
export function stripDraftingFrame(raw) {
    let text = raw.replace(/\r\n/g, '\n');
    const lines = text.split('\n');
    let i = 0;
    while (i < lines.length && (lines[i].startsWith('>') || lines[i].trim() === ''))
        i += 1;
    text = lines.slice(i).join('\n');
    const cut = text.lastIndexOf('\n---\n');
    if (cut >= 0)
        text = text.slice(0, cut);
    return text.trimEnd() + '\n';
}
export const SIGNED_DOC_FILES = SIGNED_TEMPLATE_FILES;
/**
 * Which signed template(s) each studio type (tenants.skin) gets. The ids follow
 * docs/legal; when the templates become generic (base agreement + per-skin
 * add-on, child/adult health declarations), only this map and the sources change.
 */
export const SIGNED_TEMPLATES_BY_SKIN = {
    'dance-studio': ['health-declaration'],
    photographer: ['photography-contract'],
};
/** Dance studios: a health declaration. Photographers: the shoot agreement. Others: none. */
export function signedDocForVertical(vertical) {
    return (vertical && SIGNED_TEMPLATES_BY_SKIN[vertical]?.[0]) || null;
}
export const SIGNED_DOC_TITLES = {
    'health-declaration': { en: 'Health declaration', he: 'הצהרת בריאות' },
    'photography-contract': { en: 'Photography services agreement', he: 'הסכם שירותי צילום' },
};
/** A blank the signer or the studio fills in. */
const BLANK = '______';
const NOTE_PREFIXES = ['LAWYER', 'STUDIO: confirm', 'PLACEHOLDERS', 'עו"ד', 'סטודיו: לאשר', 'ממלאי המקום'];
/** Defaults for the contract's commercial terms; the studio changes them in the Forms editor. */
const DEFAULTS = {
    '[[%]]': '30%',
    '[[before the shoot / before gallery delivery / in N instalments]]': 'before gallery delivery',
    '[[deposit refunded less ₪X / deposit kept]]': 'the deposit is refunded in full',
    '[[the deposit is kept]]': 'the deposit is kept',
    '[[deposit kept and X% of the balance is due]]': 'the deposit is kept and 50% of the balance is due',
    '[[unless agreed]]': 'unless agreed in writing',
    '[[on two cards / immediately after the shoot]]': 'immediately after the shoot',
    '[[or a free re-shoot, where possible]]': 'or a free re-shoot, where possible',
    '[[PRICES]]': 'as agreed in the quote',
    '[[HOURS of shooting, NUMBER of edited images, delivery format (online gallery / files), prints/album if any]]': 'as described in the quote',
    '[[KM]]': '30',
    '[[לפני הצילום / לפני מסירת הגלריה / ב-N תשלומים]]': 'לפני מסירת הגלריה',
    '[[המקדמה מוחזרת בניכוי X ₪ / המקדמה אינה מוחזרת]]': 'המקדמה מוחזרת במלואה',
    '[[המקדמה אינה מוחזרת]]': 'המקדמה אינה מוחזרת',
    '[[המקדמה אינה מוחזרת ויש לשלם X% מהיתרה]]': 'המקדמה אינה מוחזרת ויש לשלם 50% מהיתרה',
    '[[אלא אם סוכם]]': 'אלא אם סוכם בכתב',
    '[[בשני כרטיסים / מיד לאחר הצילום]]': 'מיד לאחר הצילום',
    '[[או צילום חוזר ללא עלות, כשהדבר אפשרי]]': 'או צילום חוזר ללא עלות, כשהדבר אפשרי',
    '[[מחירים]]': 'כפי שסוכם בהצעת המחיר',
    '[[שעות צילום, מספר תמונות ערוכות, אופן מסירה (גלריה מקוונת / קבצים), הדפסות/אלבום אם יש]]': 'כמפורט בהצעת המחיר',
    '[[ק"מ]]': '30',
};
/** The contract's [[NUMBER]]s after the business number: delivery days, gallery months, archive months. */
const NUMBER_DEFAULTS = ['30', '6', '12'];
function businessKind(status, lang) {
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
/** Keep only the parts of 07b a parent reads: the title, the privacy notice and the child version. */
function healthDeclarationSections(text) {
    const sections = text.split(/\n---\n/);
    const title = (sections[0].match(/^# .+$/m) ?? [''])[0];
    const pick = (re) => sections.find((s) => re.test(s.trim()))?.trim() ?? '';
    // Headings written for the studio ("Version A — …", "(shown above the form)") are tidied for parents.
    const privacy = pick(/^## (Privacy notice|הודעת פרטיות)/).replace(/^(## [^(\n]+?)\s*\([^)\n]*\)/, '$1');
    const child = pick(/^## (Version A|גרסה א)/).replace(/^## (Version A|גרסה א) — /, '## ');
    return [title, privacy, child].filter(Boolean).join('\n\n');
}
/** Markdown → the plain text the signing step shows (it renders text, not markdown). */
export function markdownToPlainText(md) {
    return md
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1$2')
        .replace(/^\s*> ?/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
/** The template source for a document and language (bundled from docs/legal). */
export function signedTemplateSource(doc, lang) {
    return SIGNED_TEMPLATE_SOURCES[doc][lang];
}
/** The studio's form for its type, filled: what provisioning stores as its active consent template. */
export function studioSignedTemplate(vertical, ctx) {
    const doc = signedDocForVertical(vertical);
    if (!doc)
        return null;
    return {
        doc,
        name: SIGNED_DOC_TITLES[doc][ctx.lang],
        content: prepareSignedTemplate(signedTemplateSource(doc, ctx.lang), doc, ctx),
    };
}
/** The studio's signed template text, ready to store as its first consent template. */
export function prepareSignedTemplate(raw, doc, ctx) {
    let text = stripDraftingFrame(raw);
    if (doc === 'health-declaration')
        text = healthDeclarationSections(text);
    const p = ctx.profile;
    const value = (v) => (v ?? '').trim();
    const status = p.business_status;
    const studio = {
        '[[STUDIO NAME]]': ctx.tenantName,
        '[[שם הסטודיו]]': ctx.tenantName,
        '[[PHOTOGRAPHER LEGAL NAME]]': value(p.legal_name) || ctx.tenantName,
        '[[שם משפטי]]': value(p.legal_name) || ctx.tenantName,
        '[[ADDRESS]]': value(p.address),
        '[[כתובת]]': value(p.address),
        '[[PHONE]]': value(p.phone),
        '[[טלפון]]': value(p.phone),
        '[[EMAIL]]': value(p.email) || ctx.contactEmail,
        '[[דוא"ל]]': value(p.email) || ctx.contactEmail,
        '[[GALLERY SERVICE]]': value(p.gallery_service) || (ctx.lang === 'he' ? 'שירות גלריה מקוון' : 'an online gallery service'),
        '[[שירות גלריה]]': value(p.gallery_service) || 'שירות גלריה מקוון',
        '[[1 year]]': value(p.health_retention_years) ? `${value(p.health_retention_years)} year(s)` : '1 year',
        '[[שנה]]': value(p.health_retention_years) ? `${value(p.health_retention_years)} שנים` : 'שנה',
    };
    // Neutral for any business status: VAT and tax documents are the invoicing provider's job.
    const vat = ctx.lang === 'he'
        ? '(המחיר כפי שמוצג; מע"מ ומסמכי מס, ככל שנדרשים, מונפקים דרך ספק החשבוניות כנדרש בחוק)'
        : '(prices as shown; any VAT and tax documents are issued through the invoicing provider, as the law requires)';
    studio['[[incl. VAT / no VAT — עוסק פטור]]'] = vat;
    studio['[[כולל מע"מ / ללא מע"מ — עוסק פטור]]'] = vat;
    const kind = businessKind(status, ctx.lang);
    if (kind) {
        studio['[[עוסק פטור / עוסק מורשה / company]]'] = kind;
        studio['[[עוסק פטור / עוסק מורשה / חברה]]'] = kind;
    }
    let numberIndex = 0;
    let firstNumber = true;
    // Notes in parentheses first: " ([[LAWYER: …]])" → "".
    text = text.replace(/\s*\(\[\[([^\]]+)\]\]\)/g, (whole, inner) => NOTE_PREFIXES.some((n) => inner.startsWith(n)) ? '' : whole);
    text = text.replace(/(\s?)\[\[([^\]]*)\]\]/g, (_whole, lead, inner) => {
        const ph = `[[${inner}]]`;
        if (NOTE_PREFIXES.some((n) => inner.startsWith(n)))
            return '';
        if (ph in studio)
            return studio[ph] ? lead + studio[ph] : '';
        if (DEFAULTS[ph])
            return lead + DEFAULTS[ph];
        if (inner === 'NUMBER' || inner === 'מספר') {
            if (firstNumber) {
                firstNumber = false;
                const num = value(p.business_number);
                if (num)
                    return lead + num;
                return lead + BLANK;
            }
            return lead + (NUMBER_DEFAULTS[numberIndex++] ?? BLANK);
        }
        // Plain numbers and periods ("14", "6 months", "60–14") are already the default.
        if (/^[\d–-]+( days| months| יום| חודשים)?$/.test(inner))
            return lead + inner;
        return lead + BLANK;
    });
    return markdownToPlainText(text);
}
