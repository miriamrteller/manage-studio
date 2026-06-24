import { describe, it, expect } from 'vitest';
import { EXPENSES_PAGE_SIZE } from '@/features/finance-admin/services/expenseService';

describe('expenses list constants', () => {
  it('uses page size of 50', () => {
    expect(EXPENSES_PAGE_SIZE).toBe(50);
  });
});
