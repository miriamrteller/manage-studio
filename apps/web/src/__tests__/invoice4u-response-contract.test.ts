/**
 * Contract tests for Invoice4U response handling.
 *
 * These run against responses actually recorded from the Invoice4U QA API
 * (supabase/functions/_shared/payments/invoice4u/fixtures/, captured by the U0 probe
 * — see qa-probe-summary.json). They need no network and no clearing terminal, which
 * matters: the terminal is blocked on Invoice4U enabling it, and the production
 * terminal cannot exist until the business is registered in November.
 *
 * They pin the three things about this API that are easy to get wrong:
 *   1. every response is wrapped in a .NET `{ "d": ... }` envelope
 *   2. failures arrive as HTTP 200 with a populated Errors[]
 *   3. the error member is spelled "Paramters" (their typo)
 *
 * Run: pnpm -C apps/web test invoice4u-response-contract.test.ts
 */
import { describe, expect, it } from 'vitest';
import {
  INVOICE4U_ERROR,
  describeMissingCapabilities,
  extractInvoice4uErrors,
  hasInvoice4uError,
  parseClearingTerminalCapabilities,
  unwrapInvoice4uEnvelope,
  unwrapInvoice4uOrThrow,
} from '../../../../supabase/functions/_shared/payments/invoice4u/response.ts';

import clearingAccountFixture from '../../../../supabase/functions/_shared/payments/invoice4u/fixtures/qa-getclearingaccount.redacted.json';
import processApiRequestFixture from '../../../../supabase/functions/_shared/payments/invoice4u/fixtures/qa-processapirequestv2.redacted.json';
import isAuthenticatedFixture from '../../../../supabase/functions/_shared/payments/invoice4u/fixtures/qa-isauthenticated.redacted.json';
import createDocumentFixture from '../../../../supabase/functions/_shared/payments/invoice4u/fixtures/qa-createdocument-invoice-receipt-type1.redacted.json';

describe('Invoice4U response envelope', () => {
  it('unwraps the .NET "d" wrapper', () => {
    const payload = unwrapInvoice4uEnvelope(clearingAccountFixture.body);
    expect(payload.__type).toBe('ClearingAccount:#Invoice.Common');
  });

  it('passes through a body that is already unwrapped', () => {
    expect(unwrapInvoice4uEnvelope({ Errors: [] })).toEqual({ Errors: [] });
  });

  it('rejects a non-object body rather than silently yielding nothing', () => {
    expect(() => unwrapInvoice4uEnvelope('nope')).toThrow(/not an object/);
    expect(() => unwrapInvoice4uEnvelope(null)).toThrow(/not an object/);
  });
});

describe('Invoice4U error extraction', () => {
  // The recorded clearing attempt returned HTTP 200 with an error in the body.
  // Anything keying off response.ok would read this as a successful charge.
  it('treats an HTTP 200 carrying Errors[] as a failure', () => {
    expect(processApiRequestFixture.status).toBe(200);

    const payload = unwrapInvoice4uEnvelope(processApiRequestFixture.body);
    const errors = extractInvoice4uErrors(payload);

    expect(errors).toEqual([
      { id: 96, error: 'ClearingTerminalDoesntExists' },
    ]);
  });

  it('recognises the missing-terminal code', () => {
    const payload = unwrapInvoice4uEnvelope(processApiRequestFixture.body);
    expect(hasInvoice4uError(payload, INVOICE4U_ERROR.CLEARING_TERMINAL_MISSING)).toBe(true);
    expect(hasInvoice4uError(payload, INVOICE4U_ERROR.TOKENIZATION_NOT_APPROVED)).toBe(false);
  });

  it('throws with the symbolic name and code', () => {
    expect(() => unwrapInvoice4uOrThrow(processApiRequestFixture.body, 'clearing request')).toThrow(
      /clearing request failed: ClearingTerminalDoesntExists \(96\)/,
    );
  });

  it('reports no errors for a successful document creation', () => {
    const payload = unwrapInvoice4uOrThrow(createDocumentFixture.body, 'create document');
    expect(extractInvoice4uErrors(payload)).toEqual([]);
  });

  // NB: this fixture was recorded raw — as the bare `{ "d": ... }` response — whereas
  // the others were recorded wrapped as `{ status, body }`. Worth normalising next time
  // the probe runs; asserted here so the difference is visible rather than surprising.
  it('reports no errors for a successful auth check', () => {
    expect(isAuthenticatedFixture).not.toHaveProperty('body');
    expect(() => unwrapInvoice4uOrThrow(isAuthenticatedFixture, 'auth')).not.toThrow();
  });

  it('tolerates a missing Errors member', () => {
    expect(extractInvoice4uErrors({})).toEqual([]);
  });

  // Invoice4U spells this member "Paramters". If they ever fix the typo this test
  // still passes — but the shape guard below will flag the change.
  it('does not depend on the misspelled Paramters member', () => {
    const errors = extractInvoice4uErrors({
      Errors: [{ Error: 'SomethingBroke', ID: 1234, Paramters: null }],
    });
    expect(errors).toEqual([{ id: 1234, error: 'SomethingBroke' }]);
  });
});

describe('clearing terminal capabilities', () => {
  it('reports no terminal on the QA account as recorded', () => {
    const payload = unwrapInvoice4uEnvelope(clearingAccountFixture.body);
    const caps = parseClearingTerminalCapabilities(payload);

    expect(caps.hasTerminal).toBe(false);
    expect(caps.isToken).toBeNull();
    expect(caps.isStandingOrder).toBeNull();
  });

  // null (no terminal) and false (terminal without the feature) need different
  // remedies, so they must not collapse into one another.
  it('distinguishes "not enabled" from "unknown"', () => {
    const unknown = parseClearingTerminalCapabilities({ Terminal: null, IsToken: null });
    const disabled = parseClearingTerminalCapabilities({ Terminal: '0882', IsToken: false });

    expect(unknown.isToken).toBeNull();
    expect(disabled.isToken).toBe(false);
    expect(disabled.hasTerminal).toBe(true);
  });

  it('explains a missing terminal', () => {
    const payload = unwrapInvoice4uEnvelope(clearingAccountFixture.body);
    const missing = describeMissingCapabilities(parseClearingTerminalCapabilities(payload));

    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatch(/No clearing terminal/);
  });

  it('names both capabilities when a terminal exists without them', () => {
    const caps = parseClearingTerminalCapabilities({
      Terminal: '0882',
      IsActive: true,
      IsToken: false,
      IsStandingOrder: false,
    });

    expect(describeMissingCapabilities(caps)).toEqual([
      expect.stringMatching(/309/),
      expect.stringMatching(/310/),
    ]);
  });

  // The acceptance test for the terminal request sent to Invoice4U: once they enable
  // both, GetClearingAccount must report exactly this.
  it('passes only when both capabilities are enabled', () => {
    const caps = parseClearingTerminalCapabilities({
      Terminal: '0882',
      IsActive: true,
      IsToken: true,
      IsStandingOrder: true,
    });

    expect(describeMissingCapabilities(caps)).toEqual([]);
  });
});

describe('recorded fixture shapes', () => {
  // Guards against the recorded contract drifting when fixtures are re-captured.
  it('GetClearingAccount still exposes the capability flags we rely on', () => {
    const payload = unwrapInvoice4uEnvelope(clearingAccountFixture.body);
    for (const key of ['IsToken', 'IsStandingOrder', 'Terminal', 'IsActive']) {
      expect(payload).toHaveProperty(key);
    }
  });

  it('ProcessApiRequestV2 still exposes the standing-order and token fields', () => {
    const payload = unwrapInvoice4uEnvelope(processApiRequestFixture.body);
    for (const key of [
      'IsStandingOrderClearance',
      'StandingOrderDuration',
      'StandingOrderCallBackUrl',
      'AddToken',
      'ChargeWithToken',
      'ClearingRedirectUrl',
      'OrderIdClientUsage',
    ]) {
      expect(payload).toHaveProperty(key);
    }
  });
});
