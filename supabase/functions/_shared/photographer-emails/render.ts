/** Render a photographer automatic email from its pre-built shell (Deno-safe, no React). */
import {
  applyPhotographerEmailShell,
  PHOTOGRAPHER_EMAIL_SHELLS,
  PHOTOGRAPHER_EMAIL_SUBJECTS,
  PHOTOGRAPHER_EMAIL_VARIANT_SHELLS,
  PHOTOGRAPHER_EMAIL_VARIANTS,
  type PhotographerEmailKey,
  type PhotographerEmailLanguage,
} from "../photographer-email-shells/generated.ts";
import { applyEmailBrand } from "../email-brand.ts";
import { insertBeforeParagraph, isHttpLink, signInBlockHtml } from "../sign-in-email-block.ts";

/** Emails that carry the "Go to my page" sign-in button when signInUrl is set. */
const SIGN_IN_EMAILS: readonly PhotographerEmailKey[] = ["booking_confirmed"];

/**
 * Puts the sign-in button above the email's closing line (the shells are pre-rendered).
 * The caller passes the wording (signInBody, signInCta, signInBefore = the closing line)
 * with the link, so this file stays free of the i18n bundle.
 */
function withSignInBlock(
  key: PhotographerEmailKey,
  html: string,
  variables: Record<string, string>,
  color: string,
): string {
  const { signInUrl, signInBody, signInCta, signInBefore } = variables;
  if (!SIGN_IN_EMAILS.includes(key) || !isHttpLink(signInUrl)) return html;
  if (!signInBody || !signInCta || !signInBefore) return html;
  return insertBeforeParagraph(html, signInBefore, signInBlockHtml({ body: signInBody, cta: signInCta, url: signInUrl, color }));
}

export const PHOTOGRAPHER_EMAIL_KEYS: readonly PhotographerEmailKey[] = [
  "quote_sent",
  "booking_confirmed",
  "shoot_reminder",
  "shoot_thank_you",
  "gallery_ready",
  "review_request",
  "shoot_cancelled",
  "contract_signed_client",
  "contract_signed_studio",
];

export function isPhotographerEmailKey(name: string): name is PhotographerEmailKey {
  return (PHOTOGRAPHER_EMAIL_KEYS as readonly string[]).includes(name);
}

export interface RenderPhotographerEmailInput {
  key: PhotographerEmailKey;
  language: PhotographerEmailLanguage;
  schoolName: string;
  primaryColor: string;
  accentColor: string;
  variables: Record<string, string>;
}

/**
 * Some emails have optional sections (booking_confirmed: sign / pay steps),
 * pre-rendered as separate shells. Picks the variant whose optional
 * variables are exactly the ones set; null → the base shell (none set).
 */
export function selectPhotographerEmailVariant(
  key: PhotographerEmailKey,
  variables: Record<string, string>,
): string | null {
  const variants = PHOTOGRAPHER_EMAIL_VARIANTS[key];
  if (!variants) return null;
  const optional = new Set(Object.values(variants).flat());
  const present = [...optional].filter((name) => Boolean(variables[name])).sort().join(",");
  if (!present) return null;
  for (const [variant, names] of Object.entries(variants)) {
    if ([...names].sort().join(",") === present) return variant;
  }
  return null;
}

export function renderPhotographerEmail(input: RenderPhotographerEmailInput): { html: string; subject: string } {
  const language: PhotographerEmailLanguage = input.language === "he" ? "he" : "en";
  const variant = selectPhotographerEmailVariant(input.key, input.variables);
  const shell = (variant ? PHOTOGRAPHER_EMAIL_VARIANT_SHELLS[input.key]?.[variant]?.[language] : undefined) ??
    PHOTOGRAPHER_EMAIL_SHELLS[input.key][language];
  const shellHtml = applyPhotographerEmailShell(shell, {
    schoolName: input.schoolName,
    primaryColor: input.primaryColor,
    accentColor: input.accentColor,
    variables: input.variables,
  });
  const html = applyEmailBrand(
    withSignInBlock(input.key, shellHtml, input.variables, input.primaryColor),
    input.primaryColor,
    input.accentColor,
  );
  // Subjects interpolate {schoolName} and any template variable (e.g. {clientName}).
  let subject = PHOTOGRAPHER_EMAIL_SUBJECTS[input.key][language].split("{schoolName}").join(input.schoolName);
  for (const [name, value] of Object.entries(input.variables)) {
    subject = subject.split(`{${name}}`).join(value);
  }
  return { html, subject };
}
