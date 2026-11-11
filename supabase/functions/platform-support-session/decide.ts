/** Pure checks for platform-support-session (unit-tested in decide.test.ts). */

export type SupportDecision = { ok: true } | { ok: false; status: 403 | 404; error: string };

export function decideSupportSession(input: {
  roles: string[];
  isSupportLogin: boolean;
  studioExists: boolean;
  hasVerifiedFactor: boolean;
  aal: string | null;
}): SupportDecision {
  if (!input.roles.includes("super_admin") || input.isSupportLogin) {
    return { ok: false, status: 403, error: "platform owner only" };
  }
  if (input.hasVerifiedFactor && input.aal !== "aal2") {
    return { ok: false, status: 403, error: "two_step_required" };
  }
  if (!input.studioExists) return { ok: false, status: 404, error: "studio not found" };
  return { ok: true };
}

/** The support login's address: one per studio, on OpalSwift's own domain. Never emailed. */
export function supportLoginEmail(tenantId: string): string {
  return `support+${tenantId.replace(/-/g, "").toLowerCase()}@opalswift.com`;
}

/** The "aal" claim of an already-verified access token ("Bearer …"), or null. */
export function jwtAal(authHeader: string): string | null {
  try {
    const payload = authHeader.replace(/^Bearer\s+/i, "").split(".")[1] ?? "";
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "="));
    const aal = (JSON.parse(json) as { aal?: unknown }).aal;
    return typeof aal === "string" ? aal : null;
  } catch {
    return null;
  }
}
