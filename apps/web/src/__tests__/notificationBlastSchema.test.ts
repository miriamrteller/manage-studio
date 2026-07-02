import { describe, it, expect } from 'vitest';
import { notificationBlastPreviewSchema, notificationBlastSchema } from '@/features/notifications-admin/lib/notificationBlastSchema';

describe('notificationBlastSchema', () => {
  const validBase = {
    subject: 'Studio closure notice',
    body: 'The studio will be closed next Monday for maintenance.',
  };

  it('requires categoryId when scope is level', () => {
    const result = notificationBlastSchema.safeParse({
      ...validBase,
      scope: 'level',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes('categoryId'))).toBe(true);
    }
  });

  it('requires offeringId when scope is class', () => {
    const result = notificationBlastSchema.safeParse({
      ...validBase,
      scope: 'class',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes('offeringId'))).toBe(true);
    }
  });

  it('accepts all scope without category or offering ids', () => {
    const result = notificationBlastSchema.safeParse({
      ...validBase,
      scope: 'all',
    });
    expect(result.success).toBe(true);
  });

  it('enforces subject length bounds', () => {
    expect(
      notificationBlastSchema.safeParse({ scope: 'all', subject: '', body: validBase.body }).success,
    ).toBe(false);
    expect(
      notificationBlastSchema.safeParse({
        scope: 'all',
        subject: 'x'.repeat(201),
        body: validBase.body,
      }).success,
    ).toBe(false);
  });

  it('enforces body length bounds', () => {
    expect(
      notificationBlastSchema.safeParse({ scope: 'all', subject: validBase.subject, body: 'short' })
        .success,
    ).toBe(false);
    expect(
      notificationBlastSchema.safeParse({
        scope: 'all',
        subject: validBase.subject,
        body: 'x'.repeat(5001),
      }).success,
    ).toBe(false);
  });

  it('accepts level scope with categoryId', () => {
    const result = notificationBlastSchema.safeParse({
      ...validBase,
      scope: 'level',
      categoryId: '11111111-1111-1111-1111-111111111111',
    });
    expect(result.success).toBe(true);
  });

  it('accepts class scope with offeringId', () => {
    const result = notificationBlastSchema.safeParse({
      ...validBase,
      scope: 'class',
      offeringId: '22222222-2222-2222-2222-222222222222',
    });
    expect(result.success).toBe(true);
  });

  it('requires accountId when scope is account', () => {
    const result = notificationBlastSchema.safeParse({
      ...validBase,
      scope: 'account',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes('accountId'))).toBe(true);
    }
  });

  it('accepts account scope with accountId', () => {
    const result = notificationBlastSchema.safeParse({
      ...validBase,
      scope: 'account',
      accountId: '33333333-3333-3333-3333-333333333333',
    });
    expect(result.success).toBe(true);
  });

  it('accepts optional recipientQuery on all scope', () => {
    const result = notificationBlastSchema.safeParse({
      ...validBase,
      scope: 'all',
      recipientQuery: 'smith@',
    });
    expect(result.success).toBe(true);
  });
});

describe('notificationBlastPreviewSchema', () => {
  it('accepts all scope without subject or body', () => {
    const result = notificationBlastPreviewSchema.safeParse({ scope: 'all' });
    expect(result.success).toBe(true);
  });

  it('requires categoryId when scope is level', () => {
    const result = notificationBlastPreviewSchema.safeParse({ scope: 'level' });
    expect(result.success).toBe(false);
  });
});
