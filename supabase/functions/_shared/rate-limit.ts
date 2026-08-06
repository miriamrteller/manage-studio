/**
 * OTP rate limiting, shared by every function that sends a verification code.
 *
 * Backed by increment_verification_attempt() (migration 000700): 5 attempts per
 * hour per (tenant, contact point, channel), then a one-hour block. The
 * verification_attempts CHECK already allows 'email' alongside 'sms' and
 * 'whatsapp', so nothing schema-side is needed to cover a new channel.
 *
 * This lives here rather than inside send-otp-sms because send-otp-email had no
 * limiter at all: it is reachable with only the publishable key, which made it
 * an open email-sending endpoint against the platform's own sending quota and
 * reputation. One implementation means the next channel cannot forget.
 *
 * FAILS CLOSED. If the check itself errors we refuse the send. On an endpoint
 * that needs no authentication, an unavailable limiter is indistinguishable
 * from an attacker having found a way to break it.
 */

/**
 * Structural type rather than SupabaseClient — a dangling `import type` compiles
 * under tsc and then fails at bundle time, which has bitten this codebase twice.
 */
interface RpcCapableClient {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
}

export type VerificationChannel = "email" | "sms" | "whatsapp";

export interface RateLimitResult {
  allowed: boolean;
  /** ISO timestamp the block lifts. Only set when allowed is false. */
  blockedUntil?: string;
  /** Distinguishes a real limit from a limiter that could not run. */
  reason?: "rate_limited" | "check_failed";
  message?: string;
}

interface AttemptRow {
  attempt_count?: number;
  blocked_until?: string | null;
}

export async function checkAndIncrementAttempt(
  supabase: RpcCapableClient,
  tenantId: string,
  contactPoint: string,
  channel: VerificationChannel,
): Promise<RateLimitResult> {
  try {
    const { data, error } = await supabase.rpc("increment_verification_attempt", {
      p_tenant_id: tenantId,
      p_contact_point: contactPoint,
      p_channel: channel,
    });

    if (error) {
      console.error("Rate limit RPC error:", error.message);
      return {
        allowed: false,
        reason: "check_failed",
        message: "Rate limit check unavailable",
      };
    }

    const row = (Array.isArray(data) ? data[0] : undefined) as AttemptRow | undefined;
    const blockedUntil = row?.blocked_until ?? null;

    if (blockedUntil && new Date(blockedUntil) > new Date()) {
      return {
        allowed: false,
        reason: "rate_limited",
        blockedUntil,
        message: "Too many verification attempts. Try again later.",
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error("Rate limit check failed:", error);
    return {
      allowed: false,
      reason: "check_failed",
      message: "Rate limit check unavailable",
    };
  }
}

/**
 * Contact points are the rate-limit key, so they must normalise or the limit is
 * trivially bypassed by re-casing an address or padding it with whitespace.
 */
export function normaliseContactPoint(value: string): string {
  return value.trim().toLowerCase();
}
