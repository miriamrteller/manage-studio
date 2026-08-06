/**
 * Verify a stored waiver evidence record against its HMAC seal.
 *
 * accept-waiver writes `record_hmac` over a canonical 15-field JSON, and stores
 * `hmac_key_version` alongside it — but until this module existed nothing ever
 * read either back. The seal was write-only: its entire purpose is proving,
 * later and to a third party, that a signed waiver was not altered, and there
 * was no code that could do so.
 *
 * The record's OWN hmac_key_version selects the key, not the current one. That
 * is what makes rotation safe: rows signed under V1 keep verifying with V1 after
 * WAIVER_HMAC_CURRENT_VERSION moves to 2. It is also why an old key can never be
 * deleted.
 *
 * The canonical form must match accept-waiver byte for byte — same 15 fields,
 * same alphabetical ordering, same JSON.stringify. Any drift makes every record
 * appear tampered with, so the field list is asserted rather than assumed.
 */
import { getHmacKey, hmacSha256Hex, timingSafeEqual } from "./edge-runtime/hmac.ts";

/** The 15 canonical fields, alphabetically — mirrors accept-waiver/index.ts. */
export const CANONICAL_FIELDS = [
  "accept_language",
  "consent_template_id",
  "consent_version",
  "consent_version_hash",
  "guardian_confirmed",
  "idempotency_key",
  "ip_address",
  "pdf_sha256",
  "person_id",
  "signed_at",
  "signed_by_email",
  "signed_by_name",
  "signed_by_role",
  "tenant_id",
  "user_agent",
] as const;

/** Columns a caller must select to verify a record. */
export const WAIVER_EVIDENCE_VERIFY_COLUMNS =
  `id, record_hmac, hmac_key_version, ${CANONICAL_FIELDS.join(", ")}`;

export type WaiverEvidenceRow = Record<string, unknown> & {
  id: string;
  record_hmac: string;
  hmac_key_version: number;
};

export type VerifyResult =
  | { ok: true; id: string; keyVersion: number }
  | { ok: false; id: string; keyVersion: number; reason: string };

/**
 * Rebuild the canonical JSON exactly as accept-waiver did.
 *
 * `signed_at` is a timestamptz and Postgres may hand it back in a different
 * textual form than was signed, so it is normalised to the same ISO form the
 * signer used. Every other field is stored verbatim.
 */
function canonicalise(row: WaiverEvidenceRow): string {
  const entries = CANONICAL_FIELDS.map((field) => {
    let value = row[field];
    if (field === "signed_at" && value != null) {
      value = new Date(value as string).toISOString();
    }
    return [field, value] as [string, unknown];
  });
  return JSON.stringify(
    Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b))),
  );
}

/** Verify one row. Never throws for a bad signature — that is a result, not an error. */
export async function verifyWaiverEvidence(row: WaiverEvidenceRow): Promise<VerifyResult> {
  const keyVersion = Number(row.hmac_key_version ?? 1);
  const id = String(row.id);

  if (!row.record_hmac) {
    return { ok: false, id, keyVersion, reason: "record_hmac is missing" };
  }

  let key: string;
  try {
    key = getHmacKey(keyVersion);
  } catch {
    // The key for this row's version is not configured. This is NOT a tamper
    // signal — it means an old key was retired, which must never happen.
    return {
      ok: false,
      id,
      keyVersion,
      reason:
        `WAIVER_HMAC_KEY_V${keyVersion} is not configured, so this record can no longer ` +
        `be verified. Retired keys make historic waivers unverifiable — restore it.`,
    };
  }

  const expected = await hmacSha256Hex(key, canonicalise(row));
  return timingSafeEqual(expected, String(row.record_hmac))
    ? { ok: true, id, keyVersion }
    : { ok: false, id, keyVersion, reason: "record_hmac does not match the stored fields" };
}

/** Verify many rows; returns only the failures, so an empty array means all good. */
export async function verifyWaiverEvidenceBatch(
  rows: WaiverEvidenceRow[],
): Promise<VerifyResult[]> {
  const results = await Promise.all(rows.map(verifyWaiverEvidence));
  return results.filter((r) => !r.ok);
}
