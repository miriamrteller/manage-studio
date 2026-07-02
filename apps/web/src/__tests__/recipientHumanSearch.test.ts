import { describe, expect, it } from 'vitest';
import {
  isHumanRecipientSearchQuery,
  matchesHumanRecipientSearch,
} from '@/features/notifications-admin/lib/recipientHumanSearch';
import type { BlastRecipientPreview } from '@/features/notifications-admin/lib/notificationBlastSchema';

const sampleRow: BlastRecipientPreview = {
  recipient_email: 'parent@example.com',
  recipient_name: 'Jane Parent',
  person_id: '11111111-1111-1111-1111-111111111111',
  account_member_id: null,
  account_name: 'Smith Family',
  class_names: 'Tuesday Ballet, Saturday Jazz',
};

describe('recipientHumanSearch', () => {
  it('rejects UUID-shaped search queries', () => {
    expect(isHumanRecipientSearchQuery('11111111-1111-1111-1111-111111111111')).toBe(false);
  });

  it('matches name, email, family, and class text', () => {
    expect(matchesHumanRecipientSearch(sampleRow, 'jane')).toBe(true);
    expect(matchesHumanRecipientSearch(sampleRow, 'parent@')).toBe(true);
    expect(matchesHumanRecipientSearch(sampleRow, 'smith')).toBe(true);
    expect(matchesHumanRecipientSearch(sampleRow, 'ballet')).toBe(true);
  });

  it('does not match internal person id text', () => {
    expect(matchesHumanRecipientSearch(sampleRow, '11111111-1111-1111-1111-111111111111')).toBe(
      false,
    );
  });
});
