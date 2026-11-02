/* @ts-self-types="./leadForm.d.ts" */
/**
 * Enquiry-form questions per studio (docs/plans/LEADS.md, step 2b).
 *
 * Two kinds of extra question on /inquire and /embed/inquire:
 *  - READY-MADE questions per kind of studio. A studio switches each on or off
 *    (and required or not). Several map to real lead columns the pipeline uses
 *    (child_name, child_birth_date, event_date, offering_id); the rest are
 *    stored in leads.answers under their key.
 *  - up to MAX_CUSTOM_QUESTIONS free questions, stored in leads.answers.
 *
 * The built-in fields (name, email, phone, message, marketing consent, source
 * tags, Turnstile) are not configurable and always stay.
 *
 * Pure and dependency-free: the web app and the crm-lead-capture Edge Function
 * (via the email-dist bundle) run the same rules.
 */
/** Which ready-made set fits the studio. */
export function leadFormKindFor(vertical, preset) {
    if (vertical === 'photographer')
        return 'photography';
    if (vertical === 'dance-studio')
        return 'classes';
    if (vertical === 'generic' && (preset ?? 'programs') === 'programs')
        return 'classes';
    return 'general';
}
const DAYS = [
    { value: 'sun', label: { en: 'Sunday', he: 'ראשון' } },
    { value: 'mon', label: { en: 'Monday', he: 'שני' } },
    { value: 'tue', label: { en: 'Tuesday', he: 'שלישי' } },
    { value: 'wed', label: { en: 'Wednesday', he: 'רביעי' } },
    { value: 'thu', label: { en: 'Thursday', he: 'חמישי' } },
    { value: 'fri', label: { en: 'Friday', he: 'שישי' } },
];
export const PRESET_QUESTIONS = {
    child_name: { key: 'child_name', type: 'short_text', column: 'child_name', label: { en: "Child's name", he: 'שם הילד/ה' } },
    child_age: { key: 'child_age', type: 'number', min: 1, max: 99, label: { en: "Child's age", he: 'גיל הילד/ה' } },
    child_birth_date: {
        key: 'child_birth_date',
        type: 'date',
        column: 'child_birth_date',
        label: { en: "Child's date of birth", he: 'תאריך הלידה של הילד/ה' },
    },
    class_interest: {
        key: 'class_interest',
        type: 'select',
        column: 'offering_id',
        fromClasses: true,
        label: { en: 'Class or level of interest', he: 'החוג או הרמה שמעניינים אתכם' },
    },
    experience: {
        key: 'experience',
        type: 'select',
        label: { en: 'Previous experience', he: 'ניסיון קודם' },
        options: [
            { value: 'none', label: { en: 'None yet', he: 'אין עדיין' } },
            { value: 'some', label: { en: 'Up to a year', he: 'עד שנה' } },
            { value: 'more', label: { en: 'More than a year', he: 'יותר משנה' } },
        ],
    },
    preferred_days: { key: 'preferred_days', type: 'multi_select', options: DAYS, label: { en: 'Preferred days', he: 'ימים מועדפים' } },
    event_type: {
        key: 'event_type',
        type: 'select',
        label: { en: 'Type of event', he: 'סוג האירוע' },
        options: [
            { value: 'wedding', label: { en: 'Wedding', he: 'חתונה' } },
            { value: 'bar_bat_mitzvah', label: { en: 'Bar or bat mitzvah', he: 'בר/בת מצווה' } },
            { value: 'family', label: { en: 'Family session', he: 'צילומי משפחה' } },
            { value: 'business', label: { en: 'Business or product', he: 'עסקי או מוצר' } },
            { value: 'other', label: { en: 'Other', he: 'אחר' } },
        ],
    },
    event_date: { key: 'event_date', type: 'date', column: 'event_date', label: { en: 'Event date', he: 'תאריך האירוע' } },
    event_location: { key: 'event_location', type: 'short_text', label: { en: 'Location', he: 'מיקום' } },
    budget_range: {
        key: 'budget_range',
        type: 'select',
        label: { en: 'Budget range', he: 'טווח תקציב' },
        options: [
            { value: 'under_2000', label: { en: 'Under ₪2,000', he: 'עד ₪2,000' } },
            { value: '2000_5000', label: { en: '₪2,000–5,000', he: '₪2,000–5,000' } },
            { value: '5000_10000', label: { en: '₪5,000–10,000', he: '₪5,000–10,000' } },
            { value: 'over_10000', label: { en: 'Over ₪10,000', he: 'מעל ₪10,000' } },
        ],
    },
    service_interest: { key: 'service_interest', type: 'short_text', label: { en: 'Service you are interested in', he: 'השירות שמעניין אתכם' } },
    preferred_date: { key: 'preferred_date', type: 'date', label: { en: 'Preferred date', he: 'תאריך מועדף' } },
};
export const PRESETS_BY_KIND = {
    classes: ['child_name', 'child_age', 'child_birth_date', 'class_interest', 'experience', 'preferred_days'],
    photography: ['event_type', 'event_date', 'event_location', 'budget_range'],
    general: ['service_interest', 'preferred_date'],
};
export const MAX_CUSTOM_QUESTIONS = 5;
export const MAX_CUSTOM_OPTIONS = 12;
export const MAX_LABEL_LENGTH = 120;
export const MAX_TEXT_ANSWER = 1000;
const MAX_SHORT_ANSWER = 200;
export const CUSTOM_TYPES = ['short_text', 'long_text', 'select', 'multi_select', 'number'];
export const EMPTY_LEAD_FORM = { presets: {}, custom: [] };
const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const clean = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const ID_RE = /^[a-z0-9]{1,16}$/;
function cleanBilingual(v) {
    if (!isObj(v))
        return null;
    const en = clean(v.en, MAX_LABEL_LENGTH);
    const he = clean(v.he, MAX_LABEL_LENGTH);
    if (!en && !he)
        return null;
    // One language filled is enough; the other falls back to it.
    return { en: en || he, he: he || en };
}
/**
 * Read a stored config (tenants.lead_form) safely: unknown keys, bad types,
 * questions beyond the cap and duplicate ids are dropped, never thrown.
 */
export function parseLeadFormConfig(raw) {
    if (!isObj(raw))
        return { presets: {}, custom: [] };
    const presets = {};
    if (isObj(raw.presets)) {
        for (const [key, value] of Object.entries(raw.presets)) {
            if (!(key in PRESET_QUESTIONS) || !isObj(value))
                continue;
            const enabled = value.enabled === true;
            presets[key] = { enabled, required: enabled && value.required === true };
        }
    }
    const custom = [];
    const seen = new Set();
    if (Array.isArray(raw.custom)) {
        for (const q of raw.custom) {
            if (custom.length >= MAX_CUSTOM_QUESTIONS)
                break;
            if (!isObj(q) || typeof q.id !== 'string' || !ID_RE.test(q.id) || seen.has(q.id))
                continue;
            if (!CUSTOM_TYPES.includes(q.type))
                continue;
            const label = cleanBilingual(q.label);
            if (!label)
                continue;
            const type = q.type;
            const question = { id: q.id, type, label, required: q.required === true };
            if (type === 'select' || type === 'multi_select') {
                const options = (Array.isArray(q.options) ? q.options : [])
                    .map(cleanBilingual)
                    .filter((o) => o !== null)
                    .slice(0, MAX_CUSTOM_OPTIONS);
                if (options.length === 0)
                    continue;
                question.options = options;
            }
            seen.add(q.id);
            custom.push(question);
        }
    }
    return { presets, custom };
}
/** Problems that stop the studio saving its config (shown in Settings). */
export function leadFormConfigErrors(config) {
    const errors = [];
    if (config.custom.length > MAX_CUSTOM_QUESTIONS)
        errors.push('too_many_custom');
    config.custom.forEach((q, i) => {
        if (!q.label.en.trim() && !q.label.he.trim())
            errors.push(`custom_${i}_label`);
        if ((q.type === 'select' || q.type === 'multi_select') && (!q.options || q.options.length === 0)) {
            errors.push(`custom_${i}_options`);
        }
    });
    return errors;
}
/** The questions shown for this studio, in order: ready-made first, then custom. */
export function formQuestions(config, kind, classes = []) {
    const out = [];
    for (const key of PRESETS_BY_KIND[kind]) {
        const setting = config.presets[key];
        if (!setting?.enabled)
            continue;
        const def = PRESET_QUESTIONS[key];
        const options = def.fromClasses
            ? classes.map((c) => ({ value: c.id, label: { en: c.name, he: c.name } }))
            : (def.options ?? []);
        // A class dropdown with no classes would be unanswerable: leave it out.
        if (def.fromClasses && options.length === 0)
            continue;
        out.push({ key, type: def.type, label: def.label, required: setting.required, options, min: def.min, max: def.max, column: def.column });
    }
    for (const q of config.custom) {
        out.push({
            key: `c_${q.id}`,
            type: q.type,
            label: q.label,
            required: q.required,
            options: (q.options ?? []).map((o, i) => ({ value: String(i), label: o })),
        });
    }
    return out;
}
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function validDate(value) {
    if (!DATE_RE.test(value))
        return false;
    const d = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
/**
 * Check submitted answers against the questions. Unknown keys are ignored, so
 * a stale form can't write fields the studio has switched off.
 */
export function validateLeadAnswers(questions, raw) {
    const input = isObj(raw) ? raw : {};
    const result = { ok: true, invalid: [], columns: {}, answers: {} };
    for (const q of questions) {
        const value = input[q.key];
        const empty = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
        if (empty) {
            if (q.required)
                result.invalid.push(q.key);
            continue;
        }
        const parsed = parseAnswer(q, value);
        if (parsed === null) {
            result.invalid.push(q.key);
            continue;
        }
        if (q.column) {
            result.columns[q.column] = String(parsed.value);
            // Keep a readable copy for the lead detail (e.g. the class name).
            if (q.column === 'offering_id' && parsed.display) {
                result.answers[q.key] = { label: q.label, value: parsed.value, display: parsed.display };
            }
            continue;
        }
        result.answers[q.key] = { label: q.label, ...parsed };
    }
    result.ok = result.invalid.length === 0;
    return result;
}
function parseAnswer(q, value) {
    switch (q.type) {
        case 'short_text':
        case 'long_text': {
            const text = typeof value === 'string' ? value.trim() : '';
            const max = q.type === 'short_text' ? MAX_SHORT_ANSWER : MAX_TEXT_ANSWER;
            return text && text.length <= max ? { value: text } : null;
        }
        case 'number': {
            const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
            if (!Number.isFinite(n))
                return null;
            if (q.min !== undefined && n < q.min)
                return null;
            if (q.max !== undefined && n > q.max)
                return null;
            if (Math.abs(n) > 1e9)
                return null;
            return { value: n };
        }
        case 'date':
            return typeof value === 'string' && validDate(value) ? { value } : null;
        case 'select': {
            const option = q.options.find((o) => o.value === value);
            return option ? { value: option.value, display: [option.label] } : null;
        }
        case 'multi_select': {
            if (!Array.isArray(value) || value.some((v) => typeof v !== 'string'))
                return null;
            const picked = q.options.filter((o) => value.includes(o.value));
            if (picked.length !== new Set(value).size)
                return null;
            return { value: picked.map((o) => o.value), display: picked.map((o) => o.label) };
        }
    }
    return null;
}
/** Readable text of a stored answer in one language. */
export function answerText(answer, lang) {
    if (answer.display && answer.display.length > 0)
        return answer.display.map((d) => d[lang] || d.en).join(', ');
    return Array.isArray(answer.value) ? answer.value.join(', ') : String(answer.value);
}
