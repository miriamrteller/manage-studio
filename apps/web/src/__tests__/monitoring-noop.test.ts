import { describe, expect, it } from 'vitest';
import { initMonitoring, isMonitoringEnabled, lastErrorId, reportError, toReportable } from '../lib/monitoring';

describe('monitoring without a DSN', () => {
  it('is disabled and every call is a harmless no-op', async () => {
    expect(isMonitoringEnabled()).toBe(false);
    await expect(initMonitoring()).resolves.toBeNull();
    expect(() => reportError(new Error('x'))).not.toThrow();
    expect(lastErrorId()).toBeUndefined();
  });
});

describe('toReportable', () => {
  it('turns a Supabase error object into an Error with message and code only', () => {
    const { error, code } = toReportable({ message: 'boom', code: '42501', details: 'Key (email)=(a@b.co)', hint: null });
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('boom');
    expect(error.name).toBe('SupabaseError');
    expect(code).toBe('42501');
    expect(JSON.stringify(error)).not.toContain('a@b.co');
  });
});
