/** Render a photographer automatic email from its pre-built shell (Deno-safe, no React). */
import {
  applyPhotographerEmailShell,
  PHOTOGRAPHER_EMAIL_SHELLS,
  PHOTOGRAPHER_EMAIL_SUBJECTS,
  type PhotographerEmailKey,
  type PhotographerEmailLanguage,
} from "../photographer-email-shells/generated.ts";

export const PHOTOGRAPHER_EMAIL_KEYS: readonly PhotographerEmailKey[] = [
  "quote_sent",
  "booking_confirmed",
  "shoot_reminder",
  "shoot_thank_you",
  "gallery_ready",
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

export function renderPhotographerEmail(input: RenderPhotographerEmailInput): { html: string; subject: string } {
  const language: PhotographerEmailLanguage = input.language === "he" ? "he" : "en";
  const html = applyPhotographerEmailShell(PHOTOGRAPHER_EMAIL_SHELLS[input.key][language], {
    schoolName: input.schoolName,
    primaryColor: input.primaryColor,
    accentColor: input.accentColor,
    variables: input.variables,
  });
  // Subjects interpolate {schoolName} and any template variable (e.g. {clientName}).
  let subject = PHOTOGRAPHER_EMAIL_SUBJECTS[input.key][language].split("{schoolName}").join(input.schoolName);
  for (const [name, value] of Object.entries(input.variables)) {
    subject = subject.split(`{${name}}`).join(value);
  }
  return { html, subject };
}
