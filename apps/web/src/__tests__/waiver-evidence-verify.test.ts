/**
 * The waiver evidence HMAC is the tamper-evidence seal on a signed waiver — the
 * thing you would rely on to show a record was not altered. accept-waiver wrote
 * it and stored hmac_key_version, but nothing ever read either back, so the seal
 * could not actually be checked. verify-waiver-evidence.ts closes that.
 *
 * The verifier must rebuild the canonical form byte-for-byte as the signer did.
 * If the two drift, every historic record reads as tampered — a false alarm on
 * legal evidence, which is worse than no check. These tests pin them together.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CANONICAL_FIELDS,
  verifyWaiverEvidence,
  type WaiverEvidenceRow,
} from '../../../../supabase/functions/_shared/verify-waiver-evidence.ts';
import { hmacSha256Hex } from '../../../../supabase/functions/_shared/edge-runtime/hmac.ts';

const KEY = 'test-hmac-key-v1';

beforeAll(() => {
  process.env.WAIVER_HMAC_KEY_V1 = KEY;
  process.env.WAIVER_HMAC_KEY_V2 = 'test-hmac-key-v2';
});

const signedAt = '2026-08-06T10:00:00.000Z';

const row: WaiverEvidenceRow = {
  id: 'evidence-1',
  record_hmac: '',
  hmac_key_version: 1,
  accept_language: 'he-IL',
  consent_template_id: 'tpl-1',
  consent_version: 3,
  consent_version_hash: 'abc123',
  guardian_confirmed: true,
  idempotency_key: 'idem-1',
  ip_address: '203.0.113.5',
  pdf_sha256: 'deadbeef',
  person_id: 'person-1',
  signed_at: signedAt,
  signed_by_email: 'parent@example.test',
  signed_by_name: 'A Parent',
  signed_by_role: 'guardian',
  tenant_id: 'tenant-1',
  user_agent: 'Mozilla/5.0',
};

/** Signs exactly as accept-waiver/index.ts does — sorted 15-field JSON. */
async function signLikeAcceptWaiver(r: WaiverEvidenceRow, key: string): Promise<string> {
  const canonical = JSON.stringify(
    Object.fromEntries(
      Object.entries({
        accept_language: r.accept_language,
        consent_template_id: r.consent_template_id,
        consent_version: r.consent_version,
        consent_version_hash: r.consent_version_hash,
        guardian_confirmed: r.guardian_confirmed,
        idempotency_key: r.idempotency_key,
        ip_address: r.ip_address,
        pdf_sha256: r.pdf_sha256,
        person_id: r.person_id,
        signed_at: r.signed_at,
        signed_by_email: r.signed_by_email,
        signed_by_name: r.signed_by_name,
        signed_by_role: r.signed_by_role,
        tenant_id: r.tenant_id,
        user_agent: r.user_agent,
      }).sort(([a], [b]) => a.localeCompare(b)),
    ),
  );
  return hmacSha256Hex(key, canonical);
}

describe('waiver evidence verification', () => {
  it('accepts a record signed the way accept-waiver signs it', async () => {
    const signed = { ...row, record_hmac: await signLikeAcceptWaiver(row, KEY) };
    const result = await verifyWaiverEvidence(signed);
    expect(result.ok).toBe(true);
  });

  it('rejects a record whose fields were altered after signing', async () => {
    const signed = { ...row, record_hmac: await signLikeAcceptWaiver(row, KEY) };
    const tampered = { ...signed, signed_by_name: 'Someone Else' };
    const result = await verifyWaiverEvidence(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/does not match/);
  });

  it('tolerates Postgres returning signed_at in a different textual form', async () => {
    const signed = { ...row, record_hmac: await signLikeAcceptWaiver(row, KEY) };
    // Same instant, different rendering — must not read as tampering.
    const result = await verifyWaiverEvidence({ ...signed, signed_at: '2026-08-06T10:00:00Z' });
    expect(result.ok).toBe(true);
  });

  it('uses the row\'s own key version, not the current one', async () => {
    const v2Row = { ...row, hmac_key_version: 2 };
    const signed = { ...v2Row, record_hmac: await signLikeAcceptWaiver(v2Row, 'test-hmac-key-v2') };
    const result = await verifyWaiverEvidence(signed);
    expect(result.ok).toBe(true);
  });

  it('reports a retired key as unverifiable, NOT as tampering', async () => {
    const v9 = { ...row, hmac_key_version: 9, record_hmac: 'whatever' };
    const result = await verifyWaiverEvidence(v9);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/WAIVER_HMAC_KEY_V9 is not configured/);
      expect(result.reason).not.toMatch(/does not match/);
    }
  });

  it('pins the canonical field list to what accept-waiver actually signs', () => {
    // Drift here silently invalidates every historic record, so read the signer.
    const src = readFileSync(
      resolve(__dirname, '../../../../supabase/functions/accept-waiver/index.ts'),
      'utf8',
    );
    const block = src.match(/Object\.entries\(\{([\s\S]*?)\}\)\.sort/)?.[1] ?? '';
    // Two gotchas, both of which silently undercount rather than fail loudly:
    //   - `consent_version_hash,` and `pdf_sha256,` use ES shorthand, no colon
    //   - `pdf_sha256` contains digits, so the name class must allow 0-9
    const signerFields = [...block.matchAll(/^\s+([a-z0-9_]+)\s*[:,]/gm)]
      .map((m) => m[1])
      .sort();
    expect(signerFields).toEqual([...CANONICAL_FIELDS].sort());
    expect(signerFields).toHaveLength(15);
  });
});
