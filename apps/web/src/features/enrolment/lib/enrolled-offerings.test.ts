import { describe, expect, it } from 'vitest';
import type { Engagement } from '@shared/schemas';
import {
  buildEnrolledOfferingKey,
  buildEnrolledOfferingKeys,
  isOfferingEnrolled,
  mergeClassesWithEnrolled,
} from './enrolled-offerings';

function engagement(partial: Partial<Engagement>): Engagement {
  return {
    id: 'eng-1',
    tenant_id: 'tenant-1',
    person_id: 'person-1',
    offering_id: 'offering-1',
    season_id: 'season-1',
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...partial,
  } as Engagement;
}

describe('enrolled-offerings', () => {
  it('builds offering keys for blocking duplicate enrolments only', () => {
    const keys = buildEnrolledOfferingKeys([
      engagement({ status: 'active' }),
      engagement({ offering_id: 'offering-2', status: 'cancelled' }),
      engagement({ offering_id: 'offering-3', status: 'pending_payment' }),
      engagement({ offering_id: 'offering-4', status: 'pending_waiver' }),
    ]);

    expect(keys).toEqual(
      new Set([
        buildEnrolledOfferingKey('offering-1', 'season-1'),
        buildEnrolledOfferingKey('offering-3', 'season-1'),
        buildEnrolledOfferingKey('offering-4', 'season-1'),
      ]),
    );
  });

  it('detects enrolled offerings by class and term', () => {
    const keys = new Set([buildEnrolledOfferingKey('class-a', 'term-a')]);
    expect(isOfferingEnrolled(keys, 'class-a', 'term-a')).toBe(true);
    expect(isOfferingEnrolled(keys, 'class-b', 'term-a')).toBe(false);
  });

  it('merges enrolled classes into the display list', () => {
    const available = [{ id: 'class-b', season_id: 'term-b' }];
    const all = [
      { id: 'class-a', season_id: 'term-a' },
      { id: 'class-b', season_id: 'term-b' },
    ];
    const keys = new Set([buildEnrolledOfferingKey('class-a', 'term-a')]);

    expect(mergeClassesWithEnrolled(available, all, keys)).toEqual([
      { id: 'class-b', season_id: 'term-b' },
      { id: 'class-a', season_id: 'term-a' },
    ]);
  });
});
