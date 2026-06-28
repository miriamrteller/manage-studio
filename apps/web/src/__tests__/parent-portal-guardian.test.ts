import { describe, it, expect } from 'vitest';
import { collectPortalPersonIds } from '@/features/enrolment/lib/resolveGuardianProfile';

describe('parent portal guardian helpers', () => {
  it('collects child and guardian ids for engagement queries', () => {
    const ids = collectPortalPersonIds(
      [{ id: 'child-a' }, { id: 'child-b' }],
      'guardian-a',
    );
    expect(ids).toEqual(['child-a', 'child-b', 'guardian-a']);
  });
});
