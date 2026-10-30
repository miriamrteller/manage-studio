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

export const PHOTOGRAPHER_EMAIL_KEYS: readonly PhotographerEmailKey[] = [
  "quote_sent",
  "booking_confirmed",
  "shoot_reminder",
  "shoot_thank_you",
  "gallery_ready",
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
  const html = applyPhotographerEmailShell(shell, {
    schoolName: input.schoolName,
    primaryColor: input.primaryColor,
    accentColor: input.accentColor,
    variables: input.variables,
  });
  const subject = PHOTOGRAPHER_EMAIL_SUBJECTS[input.key][language].split("{schoolName}").join(input.schoolName);
  return { html, subject };
}
