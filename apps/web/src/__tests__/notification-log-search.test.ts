import { describe, it, expect, vi } from 'vitest';
import {
  applyRecipientFilter,
  buildRecipientFilterOrClause,
  normalizeRecipientQuery,
} from '@/features/notifications/lib/notificationLogQuery';

describe('notificationLogQuery', () => {
  describe('normalizeRecipientQuery', () => {
    it('returns undefined for empty or whitespace input', () => {
      expect(normalizeRecipientQuery(undefined)).toBeUndefined();
      expect(normalizeRecipientQuery('')).toBeUndefined();
      expect(normalizeRecipientQuery('   ')).toBeUndefined();
    });

    it('passes through a normal email fragment', () => {
      expect(normalizeRecipientQuery('miriam@gmail.com')).toBe('miriam@gmail.com');
    });

    it('escapes PostgREST ilike wildcards', () => {
      expect(normalizeRecipientQuery('100%')).toBe('100\\%');
      expect(normalizeRecipientQuery('a_b')).toBe('a\\_b');
    });
  });

  describe('buildRecipientFilterOrClause', () => {
    it('returns null when query is empty', () => {
      expect(buildRecipientFilterOrClause('')).toBeNull();
      expect(buildRecipientFilterOrClause('', { personIds: [] })).toBeNull();
    });

    it('builds an or clause for email and phone', () => {
      expect(buildRecipientFilterOrClause('miriam')).toBe(
        'recipient_email.ilike.%miriam%,recipient_phone.ilike.%miriam%',
      );
    });

    it('includes recipient_person_id when person ids are provided', () => {
      expect(
        buildRecipientFilterOrClause('Sarah', {
          personIds: ['550e8400-e29b-41d4-a716-446655440010'],
        }),
      ).toBe(
        'recipient_email.ilike.%Sarah%,recipient_phone.ilike.%Sarah%,recipient_person_id.in.(550e8400-e29b-41d4-a716-446655440010)',
      );
    });

    it('includes account member ids when provided', () => {
      expect(
        buildRecipientFilterOrClause('Sarah', {
          personIds: ['550e8400-e29b-41d4-a716-446655440010'],
          accountMemberIds: ['550e8400-e29b-41d4-a716-446655440020'],
        }),
      ).toBe(
        'recipient_email.ilike.%Sarah%,recipient_phone.ilike.%Sarah%,recipient_person_id.in.(550e8400-e29b-41d4-a716-446655440010),recipient_account_member_id.in.(550e8400-e29b-41d4-a716-446655440020)',
      );
    });

    it('can match by person id only when name resolves but query is only used for lookup', () => {
      expect(
        buildRecipientFilterOrClause('Sarah', {
          personIds: ['550e8400-e29b-41d4-a716-446655440010'],
        }),
      ).toContain('recipient_person_id.in.(550e8400-e29b-41d4-a716-446655440010)');
    });

    it('escapes wildcards in the filter clause', () => {
      expect(buildRecipientFilterOrClause('100%')).toBe(
        'recipient_email.ilike.%100\\%%,recipient_phone.ilike.%100\\%%',
      );
    });
  });

  describe('applyRecipientFilter', () => {
    it('does not call or when query is empty', () => {
      const query = { or: vi.fn().mockReturnThis() };
      const result = applyRecipientFilter(query, '  ');
      expect(query.or).not.toHaveBeenCalled();
      expect(result).toBe(query);
    });

    it('applies or filter when query is present', () => {
      const query = { or: vi.fn().mockReturnThis() };
      applyRecipientFilter(query, 'test@example.com');
      expect(query.or).toHaveBeenCalledWith(
        'recipient_email.ilike.%test@example.com%,recipient_phone.ilike.%test@example.com%',
      );
    });

    it('applies person id filter when provided', () => {
      const query = { or: vi.fn().mockReturnThis() };
      applyRecipientFilter(query, 'Miriam', {
        personIds: ['550e8400-e29b-41d4-a716-446655440010'],
      });
      expect(query.or).toHaveBeenCalledWith(
        'recipient_email.ilike.%Miriam%,recipient_phone.ilike.%Miriam%,recipient_person_id.in.(550e8400-e29b-41d4-a716-446655440010)',
      );
    });
  });
});
