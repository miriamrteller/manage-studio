/**
 * Payment screenshots for photo orders paid by Bit or bank transfer (owner, 22 Nov 2026).
 *
 * The client sends a screenshot of the payment (client-photo-shop, action "proof"). It is
 * saved on the order in the private bucket photo-order-proofs and the studio is emailed.
 * It is asked for, never required: an order is never blocked or cancelled without one.
 * Until one arrives (or the studio records the payment) the client gets a reminder email
 * at 1, 3 and 7 days after ordering (expire-scheduling-holds, hourly).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";

export const PROOF_BUCKET = "photo-order-proofs";
export const PROOF_MAX_BYTES = 5 * 1024 * 1024;
/** Days after the order when each reminder is due. */
export const PROOF_REMINDER_DAYS = [1, 3, 7] as const;

export type ProofImageType = "image/png" | "image/jpeg" | "image/webp";

/** Pure: the image type from the file's first bytes (never from what the browser said). */
export function detectProofImageType(bytes: Uint8Array): ProofImageType | null {
  const at = (i: number) => bytes[i];
  if (bytes.length >= 8 && at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return "image/png";
  if (bytes.length >= 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "image/jpeg";
  if (
    bytes.length >= 12 && at(0) === 0x52 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x46 &&
    at(8) === 0x57 && at(9) === 0x45 && at(10) === 0x42 && at(11) === 0x50
  ) return "image/webp";
  return null;
}

export const PROOF_EXTENSION: Record<ProofImageType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** Pure: base64 (optionally a data: URL) to bytes; null when it isn't base64 or is too big. */
export function decodeProof(data: unknown): Uint8Array | null {
  if (typeof data !== "string" || !data) return null;
  const b64 = data.replace(/^data:[^;,]+;base64,/, "").replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return null;
  if (Math.floor((b64.length * 3) / 4) > PROOF_MAX_BYTES + 3) return null;
  try {
    const bin = atob(b64);
    if (bin.length > PROOF_MAX_BYTES) return null;
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** Pure: is the next reminder due? remindersSent counts those already sent. */
export function proofReminderDue(createdAt: string, remindersSent: number, now: Date): boolean {
  if (remindersSent >= PROOF_REMINDER_DAYS.length) return false;
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return false;
  return now.getTime() - created >= PROOF_REMINDER_DAYS[remindersSent] * 24 * 60 * 60 * 1000;
}

/** A short-lived link the studio's email can't hold; the studio opens the order instead. */
export async function proofSignedUrl(service: SupabaseClient, path: string, seconds = 600): Promise<string | null> {
  const { data } = await service.storage.from(PROOF_BUCKET).createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}
