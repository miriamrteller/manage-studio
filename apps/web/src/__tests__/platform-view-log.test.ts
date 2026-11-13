import { describe, expect, it } from 'vitest';
import { platformViewArea } from '@/hooks/usePlatformViewLog';

describe('platformViewArea', () => {
  it('names the page, never the record', () => {
    expect(platformViewArea('/admin/people')).toBe('admin-people');
    expect(platformViewArea('/admin/people/0b6c6e7f-ee7e-4f62-a49b-241ec19fadc3')).toBe('admin-people');
    expect(platformViewArea('/admin/settings')).toBe('admin-settings');
    expect(platformViewArea('/admin/payments/123/refund')).toBe('admin-payments-refund');
  });

  it('always matches the database area format', () => {
    for (const p of ['/', '', '/123', '/Admin/Ünïcode', `/${'x'.repeat(200)}`]) {
      expect(platformViewArea(p)).toMatch(/^[a-z][a-z0-9_-]{0,62}$/);
    }
  });
});
