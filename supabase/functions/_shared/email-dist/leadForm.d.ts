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
export type LeadFormLang = 'en' | 'he';
export interface Bilingual {
    en: string;
    he: string;
}
export type LeadFormKind = 'classes' | 'photography' | 'general';
/** Which ready-made set fits the studio. */
export declare function leadFormKindFor(vertical: string | null | undefined, preset?: string | null): LeadFormKind;
export type QuestionType = 'short_text' | 'long_text' | 'select' | 'multi_select' | 'number' | 'date';
export type PresetKey = 'child_name' | 'child_age' | 'child_birth_date' | 'class_interest' | 'experience' | 'preferred_days' | 'event_type' | 'event_date' | 'event_location' | 'budget_range' | 'service_interest' | 'preferred_date';
/** Lead column a ready-made answer is written to; others go to leads.answers. */
export type LeadColumn = 'child_name' | 'child_birth_date' | 'event_date' | 'offering_id';
export interface PresetDef {
    key: PresetKey;
    type: QuestionType;
    label: Bilingual;
    column?: LeadColumn;
    /** Fixed options (select / multi_select). class_interest is filled from the studio's own classes. */
    options?: Array<{
        value: string;
        label: Bilingual;
    }>;
    /** class_interest: options are the studio's public classes. */
    fromClasses?: boolean;
    min?: number;
    max?: number;
}
export declare const PRESET_QUESTIONS: Record<PresetKey, PresetDef>;
export declare const PRESETS_BY_KIND: Record<LeadFormKind, PresetKey[]>;
export declare const MAX_CUSTOM_QUESTIONS = 5;
export declare const MAX_CUSTOM_OPTIONS = 12;
export declare const MAX_LABEL_LENGTH = 120;
export declare const MAX_TEXT_ANSWER = 1000;
export declare const CUSTOM_TYPES: QuestionType[];
export interface PresetSetting {
    enabled: boolean;
    required: boolean;
}
export interface CustomQuestion {
    /** Stable id; answers are stored under `c_<id>`. */
    id: string;
    type: Exclude<QuestionType, 'date'>;
    label: Bilingual;
    required: boolean;
    /** select / multi_select only. */
    options?: Bilingual[];
}
export interface LeadFormConfig {
    presets: Partial<Record<PresetKey, PresetSetting>>;
    custom: CustomQuestion[];
}
export declare const EMPTY_LEAD_FORM: LeadFormConfig;
/**
 * Read a stored config (tenants.lead_form) safely: unknown keys, bad types,
 * questions beyond the cap and duplicate ids are dropped, never thrown.
 */
export declare function parseLeadFormConfig(raw: unknown): LeadFormConfig;
/** Problems that stop the studio saving its config (shown in Settings). */
export declare function leadFormConfigErrors(config: LeadFormConfig): string[];
/** One question as the public form renders it. */
export interface FormQuestion {
    /** Answer key: a preset key, or `c_<id>` for a custom question. */
    key: string;
    type: QuestionType;
    label: Bilingual;
    required: boolean;
    options: Array<{
        value: string;
        label: Bilingual;
    }>;
    min?: number;
    max?: number;
    column?: LeadColumn;
}
export interface ClassOption {
    id: string;
    name: string;
}
/** The questions shown for this studio, in order: ready-made first, then custom. */
export declare function formQuestions(config: LeadFormConfig, kind: LeadFormKind, classes?: ClassOption[]): FormQuestion[];
export type AnswerValue = string | number | string[];
export interface StoredAnswer {
    label: Bilingual;
    value: AnswerValue;
    /** Option labels for select answers, so the lead keeps them if the question changes later. */
    display?: Bilingual[];
}
export interface ValidatedAnswers {
    ok: boolean;
    /** Keys of questions that failed (missing when required, or invalid). */
    invalid: string[];
    columns: Partial<Record<LeadColumn, string>>;
    /** For leads.answers (everything except values written to columns). */
    answers: Record<string, StoredAnswer>;
}
/**
 * Check submitted answers against the questions. Unknown keys are ignored, so
 * a stale form can't write fields the studio has switched off.
 */
export declare function validateLeadAnswers(questions: FormQuestion[], raw: unknown): ValidatedAnswers;
/** Readable text of a stored answer in one language. */
export declare function answerText(answer: StoredAnswer, lang: LeadFormLang): string;
/** Mirrors the lead_forms CHECK constraints. */
export declare const RESERVED_FORM_SLUGS: readonly ["new", "edit", "admin", "api", "embed", "inquire", "f", "form", "forms", "settings", "default", "all", "www", "app", "login", "signup", "null", "undefined"];
export declare const FORM_SLUG_RE: RegExp;
/** Why a slug can't be used, or null when it is fine (uniqueness is checked separately). */
export declare function formSlugProblem(slug: string): 'empty' | 'format' | 'reserved' | null;
/** A slug suggestion from a name ("Grade 2 – Sunday" → "grade-2-sunday"); Hebrew-only names give "". */
export declare function suggestFormSlug(name: string): string;
/** Today's date (YYYY-MM-DD) in a time zone; the studio's day decides when a form closes. */
export declare function todayIn(timeZone: string, now?: Date): string;
export declare const FORM_TIME_ZONE = "Asia/Jerusalem";
/** Open = switched on and not past its last day (the last day itself is still open). */
export declare function leadFormIsOpen(form: {
    active: boolean;
    ends_on: string | null;
}, today: string): boolean;
/** The questions a named form asks: its chosen keys, in the studio's order; null keys = all. */
export declare function questionsForForm(questions: FormQuestion[], keys: readonly string[] | null | undefined): FormQuestion[];
/** What /f/<slug> needs (get_named_lead_form). */
export interface NamedFormPublic {
    status: 'open' | 'closed';
    id?: string;
    slug?: string;
    title_en?: string | null;
    title_he?: string | null;
    intro_en?: string | null;
    intro_he?: string | null;
    image_url?: string | null;
    question_keys?: string[] | null;
    offering_id?: string | null;
}
export declare function parseNamedForm(raw: unknown): NamedFormPublic | null;
//# sourceMappingURL=leadForm.d.ts.map