import {
  applyMagicLinkShell,
  applyStudioOwnerWelcomeShell,
  MAGIC_LINK_SHELLS,
  STUDIO_OWNER_WELCOME_SHELLS,
  type AuthEmailLanguage,
} from "./auth-email-shells/generated.ts";
import { deriveEmailBrand, OPALSWIFT_EMAIL_ANCHOR } from "./email-dist/email/brand.js";

export { OPALSWIFT_EMAIL_ANCHOR };

export interface RenderAuthMagicLinkInput {
  language: AuthEmailLanguage;
  schoolName: string;
  magicLinkUrl: string;
  otpCode?: string;
  primaryColor: string;
  accentColor: string;
  /** Colour the header/button gradient shifts toward (default: the accent; OpalSwift's own mail: its purple). */
  gradientAnchor?: string;
}

/**
 * Render magic-link auth email HTML without React (Deno-safe).
 * Shells are pre-built at deploy time via scripts/build-auth-email-shells.mjs.
 */
export function renderAuthMagicLinkHtml(input: RenderAuthMagicLinkInput): string {
  const lang = input.language === "he" ? "he" : "en";
  const shellSet = MAGIC_LINK_SHELLS[lang];
  const shell = input.otpCode ? shellSet.withOtp : shellSet.linkOnly;
  const brand = deriveEmailBrand(input.primaryColor, input.gradientAnchor ?? input.accentColor);
  return applyMagicLinkShell(shell, {
    magicLinkUrl: input.magicLinkUrl,
    schoolName: input.schoolName,
    otpCode: input.otpCode,
    primaryColor: input.primaryColor,
    accentColor: input.accentColor,
    brandFill: brand.fill,
    brandEnd: brand.end,
  });
}

/** Where the welcome email's questions go (the "Reply-To" header). */
export const STUDIO_OWNER_WELCOME_REPLY_TO = "hello@opalswift.com";

/** OpalSwift's gem, served by the app Worker from apps/web/public on every host. */
export const OPALSWIFT_LOGO_PATH = "/opalswift-gem.png";

export interface RenderStudioOwnerWelcomeInput {
  language: AuthEmailLanguage;
  studioName: string;
  /** e.g. https://<subdomain>.opalswift.com (no trailing slash) */
  studioUrl: string;
  inviteUrl: string;
}

/**
 * The welcome a new studio owner gets with their invite link (auth action
 * "invite", sent by provision-studio). OpalSwift-branded, in the studio's
 * language. Answers go to hello@opalswift.com.
 */
export function renderStudioOwnerWelcome(
  input: RenderStudioOwnerWelcomeInput,
): { subject: string; html: string; replyTo: string } {
  const lang = input.language === "he" ? "he" : "en";
  const { subject, html } = applyStudioOwnerWelcomeShell(STUDIO_OWNER_WELCOME_SHELLS[lang], {
    studioName: input.studioName,
    studioUrl: input.studioUrl,
    inviteUrl: input.inviteUrl,
    logoUrl: `${input.studioUrl}${OPALSWIFT_LOGO_PATH}`,
  });
  return { subject, html, replyTo: STUDIO_OWNER_WELCOME_REPLY_TO };
}
