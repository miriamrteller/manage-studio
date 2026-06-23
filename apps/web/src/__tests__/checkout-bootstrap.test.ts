import { describe, expect, it } from 'vitest';
import {
  parsePrepareEnrolmentCheckoutBody,
  resolveBootstrapBlockReason,
} from '../../../../supabase/functions/_shared/checkout-bootstrap-parse.ts';

describe('parsePrepareEnrolmentCheckoutBody', () => {
  it('accepts existing_engagement load without offering_id', () => {
    const parsed = parsePrepareEnrolmentCheckoutBody({
      phase: 'load',
      mode: 'existing_engagement',
      engagement_id: '00000000-0000-0000-0000-000000000301',
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.body.phase).toBe('load');
      expect(parsed.body.offering_id).toBeUndefined();
    }
  });

  it('requires offering_id for existing_engagement pay phase', () => {
    const parsed = parsePrepareEnrolmentCheckoutBody({
      phase: 'pay',
      mode: 'existing_engagement',
      engagement_id: '00000000-0000-0000-0000-000000000301',
    });
    expect(parsed.ok).toBe(false);
  });

  it('requires pay phase for create_engagement', () => {
    const parsed = parsePrepareEnrolmentCheckoutBody({
      phase: 'load',
      mode: 'create_engagement',
      person_id: '00000000-0000-0000-0000-000000000101',
      offering_id: '00000000-0000-0000-0000-000000000201',
      season_id: '00000000-0000-0000-0000-000000000401',
    });
    expect(parsed.ok).toBe(false);
  });

  it('accepts create_engagement pay body', () => {
    const parsed = parsePrepareEnrolmentCheckoutBody({
      phase: 'pay',
      mode: 'create_engagement',
      person_id: '00000000-0000-0000-0000-000000000101',
      offering_id: '00000000-0000-0000-0000-000000000201',
      season_id: '00000000-0000-0000-0000-000000000401',
    });
    expect(parsed.ok).toBe(true);
  });
});

describe('resolveBootstrapBlockReason', () => {
  it('maps active status to already_complete', () => {
    expect(resolveBootstrapBlockReason('active', false)).toBe('already_complete');
  });

  it('maps pending_waiver to pending_waiver', () => {
    expect(resolveBootstrapBlockReason('pending_waiver', false)).toBe('pending_waiver');
  });

  it('maps unsigned waiver to waiver_required', () => {
    expect(resolveBootstrapBlockReason('pending_payment', true)).toBe('waiver_required');
  });

  it('returns undefined when payable', () => {
    expect(resolveBootstrapBlockReason('pending_payment', false)).toBeUndefined();
  });
});
