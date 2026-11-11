/**
 * Takbull PR 7: a studio opens its own Takbull account with OpalSwift's keys (CreateAccount,
 * OpalSwift pays). Prefill from the legal details; the password, ID and bank details go to
 * Takbull only; the new keys are saved through save_opened_takbull_account. Fake database and
 * the mock Takbull only.
 */
import { describe, it, expect, vi } from 'vitest';
import { makeFakeSupabase } from '../test/fakeSupabase';
import {
  accountOutcome,
  buildCreateAccountRequest,
  businessTypeFor,
  inputProblems,
  loadOpenAccountPrefill,
  openStudioTakbullAccount,
  passwordProblems,
  splitAddress,
  splitName,
  type OpenAccountInput,
} from '../../../../supabase/functions/_shared/payments/takbull/open-account';
import { MockTakbullApi } from '../../../../supabase/functions/_shared/payments/takbull/mock';

const TENANT = '00000000-0000-4000-8000-0000000000aa';
const USER = '00000000-0000-4000-8000-0000000000bb';

const GOOD: OpenAccountInput = {
  loginEmail: 'owner@lens.test', password: 'Strong#Pass1', businessName: 'Lens Studio Ltd', businessNumber: '515555555',
  businessType: 2, businessEmail: 'owner@lens.test', phone: '0501234567', street: 'Herzl 1', city: 'Tel Aviv',
  ownerFirstName: 'Dana', ownerLastName: 'Levi', ownerIdNumber: '123456782', bankCode: '12', branchCode: '345', accountNumber: '678901',
};

function seed(extra: { opened?: boolean; packageId?: string | null } = {}) {
  const fake = makeFakeSupabase({
    tenants: [{
      id: TENANT, name: 'Lens Studio', contact_email: 'studio@lens.test',
      takbull_account_opened_at: extra.opened ? '2026-11-10T10:00:00Z' : null,
      legal_profile: { legal_name: 'Lens Studio Ltd', business_status: 'company', business_number: '515555555', email: 'owner@lens.test', phone: '0501234567', address: 'Herzl 1, Tel Aviv' },
    }],
    user_profiles: [{ id: USER, person_id: 'p1' }],
    people: [{ id: 'p1', name: 'Dana Levi' }],
    platform_billing_settings: [{ id: true, takbull_child_package_id: extra.packageId ?? null }],
  } as Record<string, Array<Record<string, unknown>>>);
  const rpc = vi.fn(async () => ({ data: null, error: null }));
  (fake.client as unknown as { rpc: typeof rpc }).rpc = rpc;
  return { ...fake, rpc };
}

describe('helpers', () => {
  it('maps the business status to Takbull\'s business type; unregistered has none', () => {
    expect(businessTypeFor('osek_murshe')).toBe(1);
    expect(businessTypeFor('company')).toBe(2);
    expect(businessTypeFor('osek_patur')).toBe(3);
    expect(businessTypeFor('not_registered')).toBeNull();
  });
  it('checks Takbull\'s password rule', () => {
    expect(passwordProblems('Strong#Pass1')).toEqual([]);
    expect(passwordProblems('weak')).toEqual(['length', 'upper', 'digit', 'special']);
  });
  it('splits names and addresses', () => {
    expect(splitName('Dana Levi Cohen')).toEqual({ first: 'Dana', last: 'Levi Cohen' });
    expect(splitAddress('Herzl 1, Tel Aviv')).toEqual({ street: 'Herzl 1', city: 'Tel Aviv' });
    expect(splitAddress('Herzl 1')).toEqual({ street: 'Herzl 1', city: '' });
  });
  it('names missing or wrong fields, never their values', () => {
    expect(inputProblems(GOOD)).toEqual([]);
    expect(inputProblems({ ...GOOD, bankCode: '', password: 'short', loginEmail: 'x', ownerIdNumber: 'abc' }).sort())
      .toEqual(['bankCode', 'loginEmail', 'ownerIdNumber', 'password']);
  });
});

describe('the request', () => {
  it('has OpalSwift pay, with the package when one is set', () => {
    const r = buildCreateAccountRequest(GOOD, 'pkg-1');
    expect(r).toMatchObject({
      Email: 'owner@lens.test', SubscriptionPayer: 'Parent', PackageUniqId: 'pkg-1',
      MerchantDetails: { Name: 'Lens Studio Ltd', BusinessType: 2, IdentityNumber: '123456782', bankcode: '12', branchcode: '345', accountnumber: '678901', City: 'Tel Aviv' },
    });
    expect(buildCreateAccountRequest(GOOD, null)).not.toHaveProperty('PackageUniqId');
  });
  it('reads Takbull\'s answers', () => {
    expect(accountOutcome({ ErrorCode: 0, MerchantId: 'm', ApiKey: 'k', ApiSecret: 's' })).toMatchObject({ ok: true, freePackage: false });
    expect(accountOutcome({ ErrorCode: 1, ApiKey: 'k', ApiSecret: 's' })).toMatchObject({ ok: true, freePackage: true });
    expect(accountOutcome({ ErrorCode: 0, ApiKey: null })).toMatchObject({ ok: false, code: 'no_keys' });
    expect(accountOutcome({ ErrorCode: 600109 })).toMatchObject({ code: 'email_taken' });
    expect(accountOutcome({ ErrorCode: 600128, ErrorMessage: 'duplicate BusinessNumber' })).toMatchObject({ code: 'details_rejected', message: 'duplicate BusinessNumber' });
    expect(accountOutcome({ ErrorCode: 600108 })).toMatchObject({ code: 'not_allowed' });
    expect(accountOutcome({ ErrorCode: 600113 })).toMatchObject({ code: 'payment_required' });
    expect(accountOutcome({ ErrorCode: 600115 })).toMatchObject({ code: 'takbull_error' });
  });
});

describe('prefill', () => {
  it('fills the business and owner details we already know', async () => {
    const { client } = seed();
    const p = await loadOpenAccountPrefill(client as never, TENANT, USER);
    expect(p).toMatchObject({
      opened: false, businessName: 'Lens Studio Ltd', businessNumber: '515555555', businessType: 2,
      businessEmail: 'owner@lens.test', phone: '0501234567', street: 'Herzl 1', city: 'Tel Aviv',
      ownerFirstName: 'Dana', ownerLastName: 'Levi',
    });
  });
});

describe('opening the account', () => {
  it('opens it with OpalSwift\'s keys and saves the new keys', async () => {
    const { client, rpc } = seed({ packageId: 'pkg-1' });
    const api = new MockTakbullApi();
    const r = await openStudioTakbullAccount(client as never, { tenantId: TENANT, userId: USER, fields: GOOD }, { api });
    expect(r).toEqual({ ok: true, merchantId: 'mock-mid-1', freePackage: false });
    expect(api.accounts[0]).toMatchObject({ SubscriptionPayer: 'Parent', PackageUniqId: 'pkg-1' });
    expect(rpc).toHaveBeenCalledWith('save_opened_takbull_account', {
      p_tenant_id: TENANT, p_actor_id: USER, p_api_key: 'mock-child-key-1', p_api_secret: 'mock-child-secret-1', p_merchant_id: 'mock-mid-1',
    });
    // The answer to the browser carries no keys.
    expect(JSON.stringify(r)).not.toContain('mock-child');
  });

  it('calls nothing when details are missing', async () => {
    const { client, rpc } = seed();
    const api = new MockTakbullApi();
    const r = await openStudioTakbullAccount(client as never, { tenantId: TENANT, userId: USER, fields: { ...GOOD, accountNumber: '' } }, { api });
    expect(r).toEqual({ ok: false, code: 'invalid_input', fields: ['accountNumber'] });
    expect(api.accounts).toHaveLength(0);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('opens only one account per studio', async () => {
    const { client } = seed({ opened: true });
    const api = new MockTakbullApi();
    expect(await openStudioTakbullAccount(client as never, { tenantId: TENANT, userId: USER, fields: GOOD }, { api }))
      .toEqual({ ok: false, code: 'already_opened' });
    expect(api.accounts).toHaveLength(0);
  });

  it('passes on Takbull\'s refusal and saves nothing', async () => {
    const { client, rpc } = seed();
    const api = new MockTakbullApi();
    await openStudioTakbullAccount(client as never, { tenantId: TENANT, userId: USER, fields: GOOD }, { api });
    rpc.mockClear();
    const again = await openStudioTakbullAccount(client as never, { tenantId: TENANT, userId: USER, fields: GOOD }, { api });
    expect(again).toMatchObject({ ok: false, code: 'email_taken' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('says not set up when OpalSwift has no keys on this site', async () => {
    const { client } = seed();
    vi.stubGlobal('Deno', { env: { get: () => undefined } });
    const r = await openStudioTakbullAccount(client as never, { tenantId: TENANT, userId: USER, fields: GOOD });
    expect(r).toEqual({ ok: false, code: 'not_set_up' });
    vi.unstubAllGlobals();
  });
});
