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
import { OPTIONAL_CANONICAL_FIELDS } from '../../../../supabase/functions/_shared/verify-waiver-evidence.ts';
import { canonicalJson } from '@shared';

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
    // The signer builds the object inline and hands it to waiverRecordHmac()
    // (_shared/contract-pdf/evidence.ts), which sorts and serialises it.
    const block = src.match(/waiverRecordHmac\(hmacKey, \{([\s\S]*?)\n\s*\}\)/)?.[1] ?? '';
    // Two gotchas, both of which silently undercount rather than fail loudly:
    //   - `consent_version_hash,` and `pdf_sha256,` use ES shorthand, no colon
    //   - `pdf_sha256` contains digits, so the name class must allow 0-9
    const signerFields = [...block.matchAll(/^\s+([a-z0-9_]+)\s*[:,]/gm)]
      .map((m) => m[1])
      .sort();
    // The 15 original fields plus signer_details (sealed only when the record has it).
    expect(signerFields).toEqual([...CANONICAL_FIELDS, ...OPTIONAL_CANONICAL_FIELDS].sort());
    expect(signerFields).toHaveLength(16);
  });
});

describe('waiver evidence verification with signer details', () => {
  const details = {
    version: 1,
    confirmed: true,
    confirmed_wording: 'These details are correct',
    signer: {
      full_name: 'A Parent',
      id_type: 'israeli_id',
      id_number: '123456782',
      phone: '050-123-4567',
      address: '1 Herzl St, Haifa',
    },
    child: { full_name: 'A Child', date_of_birth: '2016-01-02', dob_differs_from_profile: false },
  };

  /** Signs as accept-waiver does: 15 fields + signer_details, deep-sorted. */
  async function signWithDetails(r: WaiverEvidenceRow, d: unknown, key: string): Promise<string> {
    const { id: _id, record_hmac: _h, hmac_key_version: _v, ...fields } = r;
    const all = { ...fields, signer_details: JSON.parse(canonicalJson(d)) };
    return hmacSha256Hex(
      key,
      JSON.stringify(Object.fromEntries(Object.entries(all).sort(([a], [b]) => a.localeCompare(b)))),
    );
  }

  it('accepts a record sealed with signer details', async () => {
    const signed = { ...row, signer_details: details, record_hmac: await signWithDetails(row, details, KEY) };
    expect((await verifyWaiverEvidence(signed)).ok).toBe(true);
  });

  it('does not care which key order Postgres returns the jsonb in', async () => {
    const signed = { ...row, record_hmac: await signWithDetails(row, details, KEY) };
    const reordered = {
      child: details.child,
      signer: { address: details.signer.address, phone: details.signer.phone, id_number: details.signer.id_number,
        id_type: details.signer.id_type, full_name: details.signer.full_name },
      confirmed_wording: details.confirmed_wording,
      confirmed: true,
      version: 1,
    };
    expect((await verifyWaiverEvidence({ ...signed, signer_details: reordered })).ok).toBe(true);
  });

  it('rejects a changed ID number, phone, address or child date of birth', async () => {
    const signed = { ...row, record_hmac: await signWithDetails(row, details, KEY) };
    const edits: Array<(d: typeof details) => typeof details> = [
      (d) => ({ ...d, signer: { ...d.signer, id_number: '123456789' } }),
      (d) => ({ ...d, signer: { ...d.signer, phone: '050-000-0000' } }),
      (d) => ({ ...d, signer: { ...d.signer, address: 'Elsewhere 5' } }),
      (d) => ({ ...d, child: { ...d.child, date_of_birth: '2015-01-02' } }),
    ];
    for (const edit of edits) {
      const result = await verifyWaiverEvidence({ ...signed, signer_details: edit(details) });
      expect(result.ok).toBe(false);
    }
  });

  it('rejects details added to, or removed from, a record sealed without/with them', async () => {
    const legacy = { ...row, record_hmac: await signLikeAcceptWaiver(row, KEY) };
    expect((await verifyWaiverEvidence({ ...legacy, signer_details: null })).ok).toBe(true);
    expect((await verifyWaiverEvidence({ ...legacy, signer_details: details })).ok).toBe(false);
    const sealed = { ...row, signer_details: details, record_hmac: await signWithDetails(row, details, KEY) };
    expect((await verifyWaiverEvidence({ ...sealed, signer_details: null })).ok).toBe(false);
  });
});
