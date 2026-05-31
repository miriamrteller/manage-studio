import {
  applyMagicLinkShell,
  MAGIC_LINK_SHELLS,
  type AuthEmailLanguage,
} from "./auth-email-shells/generated.ts";

export interface RenderAuthMagicLinkInput {
  language: AuthEmailLanguage;
  schoolName: string;
  magicLinkUrl: string;
  otpCode?: string;
  primaryColor: string;
  accentColor: string;
}

/**
 * Render magic-link auth email HTML without React (Deno-safe).
 * Shells are pre-built at deploy time via scripts/build-auth-email-shells.mjs.
 */
export function renderAuthMagicLinkHtml(input: RenderAuthMagicLinkInput): string {
  const lang = input.language === "he" ? "he" : "en";
  const shellSet = MAGIC_LINK_SHELLS[lang];
  const shell = input.otpCode ? shellSet.withOtp : shellSet.linkOnly;
  return applyMagicLinkShell(shell, {
    magicLinkUrl: input.magicLinkUrl,
    schoolName: input.schoolName,
    otpCode: input.otpCode,
    primaryColor: input.primaryColor,
    accentColor: input.accentColor,
  });
}
