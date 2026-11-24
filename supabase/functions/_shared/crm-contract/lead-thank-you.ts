/**
 * The automatic "thank you" email a studio can send to each new sign-up from
 * its website form (tenants.lead_thank_you). Off unless the studio switches it
 * on; the text is the studio's own, in English and Hebrew, sent in the
 * language the visitor used. {name} becomes the visitor's first name and
 * {studio} the studio's name.
 */
export interface LeadThankYouConfig {
  enabled: boolean;
  subject_en: string;
  body_en: string;
  subject_he: string;
  body_he: string;
}

const MAX_SUBJECT = 200;
const MAX_BODY = 5000;

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function parseLeadThankYou(raw: unknown): LeadThankYouConfig {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    enabled: obj.enabled === true,
    subject_en: text(obj.subject_en, MAX_SUBJECT),
    body_en: text(obj.body_en, MAX_BODY),
    subject_he: text(obj.subject_he, MAX_SUBJECT),
    body_he: text(obj.body_he, MAX_BODY),
  };
}

function fill(template: string, name: string, studio: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  return template
    .replaceAll("{name}", first)
    .replaceAll("{studio}", studio)
    // "Hi ," when there is no name: drop the stray space.
    .replace(/ +([,،])/g, "$1");
}

/**
 * The email to send, or null when it is off or has no text in either
 * language. Falls back to the other language when one side is empty.
 */
export function buildLeadThankYou(
  config: LeadThankYouConfig,
  lang: "en" | "he",
  vars: { name: string; studio: string },
): { subject: string; body: string; language: "en" | "he" } | null {
  if (!config.enabled) return null;
  const sides: Array<"en" | "he"> = lang === "he" ? ["he", "en"] : ["en", "he"];
  for (const side of sides) {
    const subject = side === "he" ? config.subject_he : config.subject_en;
    const body = side === "he" ? config.body_he : config.body_en;
    if (subject && body) {
      return {
        subject: fill(subject, vars.name, vars.studio),
        body: fill(body, vars.name, vars.studio),
        language: side,
      };
    }
  }
  return null;
}
