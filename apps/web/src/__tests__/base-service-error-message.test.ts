/**
 * BaseService.withRetry keeps the real reason when a Supabase call fails (issue #285 read
 * "failed after 3 retries: [object Object]"). Supabase errors are plain objects, not Error instances.
 * Run: pnpm -C apps/web test base-service-error-message.test.ts
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { BaseService } from '@/services/base.service';

class TestService extends BaseService {
  protected static readonly RETRY_DELAY_MS = 0;
  static run<T>(fn: () => Promise<T>) {
    return this.withRetry(fn, 'TestService.list');
  }
}

describe('withRetry with a Supabase-style error object', () => {
  it('keeps the message and does not retry a permission error', async () => {
    const fn = vi.fn().mockRejectedValue({ message: 'permission denied for table billing_accounts', code: '42501' });
    await expect(TestService.run(fn)).rejects.toThrow('permission denied for table billing_accounts');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries a transient error 3 times and reports its message, not [object Object]', async () => {
    const fn = vi.fn().mockRejectedValue({ message: 'Failed to fetch' });
    const error = (await TestService.run(fn).catch((e: Error) => e)) as Error;
    expect(fn).toHaveBeenCalledTimes(3);
    expect(error.message).toBe('TestService.list failed after 3 retries: Failed to fetch');
    expect(error.message).not.toContain('[object Object]');
  });

  it('still handles real Errors and plain strings', async () => {
    const e1 = (await TestService.run(vi.fn().mockRejectedValue(new Error('boom'))).catch((e: Error) => e)) as Error;
    expect(e1.message).toContain('boom');
    const e2 = (await TestService.run(vi.fn().mockRejectedValue('plain text')).catch((e: Error) => e)) as Error;
    expect(e2.message).toContain('plain text');
  });
});
