import {
  renderAuthMagicLinkHtml,
  renderStudioOwnerWelcome,
} from "../_shared/render-auth-email.ts";
import { isPlatformEmailConfig, type TenantEmailConfig } from "../_shared/tenant-email.ts";
import { OPALSWIFT_EMAIL_ANCHOR } from "../_shared/render-auth-email.ts";

export interface ComposeAuthEmailInput {
  action: string;
  tenant: TenantEmailConfig;
  confirmationUrl: string;
  otpCode?: string;
  /** The studio's magic-link string overrides (subject etc.). */
  strings: Record<string, unknown>;
  /** The studio's address, e.g. https://<sub>.opalswift.com; null if it cannot be built. */
  studioUrl: string | null;
}

export interface AuthEmailMessage {
  subject: string;
  html: string;
  replyTo?: string;
}

export function subjectForAction(
  action: string,
  schoolName: string,
  strings: Record<string, unknown>,
): string {
  if (action === "magiclink" || action === "signup") {
    const template = String(strings.subject || strings.preview || "Sign in to {schoolName}");
    return template.replace("{schoolName}", schoolName);
  }
  if (action === "recovery") {
    return `Reset your password — ${schoolName}`;
  }
  if (action === "invite") {
    return `You've been invited to ${schoolName}`;
  }
  if (action === "email_change") {
    return `Confirm your email change — ${schoolName}`;
  }
  return `Notification from ${schoolName}`;
}

/**
 * Subject, HTML and Reply-To for one auth email. An "invite" for a studio (only
 * provision-studio sends invites: a new studio's owner) gets the OpalSwift
 * welcome; everything else is the studio's magic-link email, as before.
 */
export function composeAuthEmail(input: ComposeAuthEmailInput): AuthEmailMessage {
  const { action, tenant, confirmationUrl, otpCode, strings, studioUrl } = input;

  if (action === "invite" && tenant.id && studioUrl) {
    return renderStudioOwnerWelcome({
      language: tenant.language,
      studioName: tenant.name,
      studioUrl,
      inviteUrl: confirmationUrl,
    });
  }

  return {
    subject: subjectForAction(action, tenant.name, strings),
    html: renderAuthMagicLinkHtml({
      language: tenant.language,
      schoolName: tenant.name,
      magicLinkUrl: confirmationUrl,
      otpCode,
      primaryColor: tenant.primary_color,
      accentColor: tenant.accent_color,
      // OpalSwift's own mail (platform host) shifts toward its purple; a studio's toward its accent.
      gradientAnchor: isPlatformEmailConfig(tenant) ? OPALSWIFT_EMAIL_ANCHOR : undefined,
    }),
  };
}
