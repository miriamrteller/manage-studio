/**
 * Resolve the From address for transactional email (enrolment, payment, waivers).
 * Uses NOTIFICATION_FROM_EMAIL when set — same verified sender as auth/login emails.
 * Falls back to tenant.from_email for production tenants with their own verified domain.
 */
export function resolveNotificationFromEmail(
  tenantFromEmail: string | null | undefined,
): string {
  const platform = Deno.env.get("NOTIFICATION_FROM_EMAIL")?.trim();
  if (platform) return platform;

  const tenant = tenantFromEmail?.trim();
  if (tenant) return tenant;

  throw new Error("Sender email is not configured");
}
