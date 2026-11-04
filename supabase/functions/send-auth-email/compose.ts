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

const HELP_EMAIL = "hello@opalswift.com";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * The notice to the OLD address after a login-email change (Supabase
 * email_changed_notification). No link: it only says what happened and who to contact.
 */
export function composeLoginEmailChangedNotice(input: { tenant: TenantEmailConfig; newEmail: string }): AuthEmailMessage {
  const he = input.tenant.language === "he";
  const studio = escapeHtml(input.tenant.name);
  const newEmail = escapeHtml(input.newEmail);
  const subject = he ? `אימייל ההתחברות שלך שונה — ${input.tenant.name}` : `Your login email was changed — ${input.tenant.name}`;
  const lines = he
    ? [
      `אימייל ההתחברות שלך ב-${studio} שונה ל-<strong dir="ltr">${newEmail}</strong>.`,
      `אם לא ביצעת את השינוי, יש לפנות ל-OpalSwift: <a href="mailto:${HELP_EMAIL}">${HELP_EMAIL}</a>.`,
    ]
    : [
      `Your login email for ${studio} was changed to <strong>${newEmail}</strong>.`,
      `If this wasn't you, contact OpalSwift: <a href="mailto:${HELP_EMAIL}">${HELP_EMAIL}</a>.`,
    ];
  const html = `<!doctype html><html lang="${he ? "he" : "en"}" dir="${he ? "rtl" : "ltr"}"><body style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#1f2937;padding:24px">${
    lines.map((l) => `<p>${l}</p>`).join("")
  }</body></html>`;
  return { subject, html, replyTo: HELP_EMAIL };
}
