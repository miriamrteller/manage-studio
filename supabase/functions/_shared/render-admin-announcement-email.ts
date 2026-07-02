import {
  applyAdminAnnouncementShell,
  ADMIN_ANNOUNCEMENT_SHELLS,
  type AdminAnnouncementEmailLanguage,
} from "./admin-announcement-email-shells/generated.ts";

export interface RenderAdminAnnouncementInput {
  language: AdminAnnouncementEmailLanguage;
  schoolName: string;
  subject: string;
  body: string;
  primaryColor: string;
  accentColor: string;
}

/** Render admin announcement HTML without React (Deno-safe). */
export function renderAdminAnnouncementHtml(input: RenderAdminAnnouncementInput): string {
  const lang = input.language === "he" ? "he" : "en";
  const shell = ADMIN_ANNOUNCEMENT_SHELLS[lang];
  return applyAdminAnnouncementShell(shell, input);
}
