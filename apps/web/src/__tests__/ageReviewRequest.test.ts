import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { mapAgeReviewRpcError } from '@/features/enrolment/lib/ageReviewService';

const noteSchema = z.string().trim().min(10).max(1000);

describe('age review request note validation', () => {
  it('rejects notes shorter than 10 characters', () => {
    expect(noteSchema.safeParse('123456789').success).toBe(false);
  });

  it('accepts notes with at least 10 characters', () => {
    expect(noteSchema.safeParse('1234567890').success).toBe(true);
  });
});

describe('mapAgeReviewRpcError', () => {
  it('maps RPC error codes to i18n keys', () => {
    expect(mapAgeReviewRpcError('AGE_ELIGIBLE')).toBe('pages.enrolment.age_review_error_eligible');
    expect(mapAgeReviewRpcError('INVALID_NOTE')).toBe('pages.enrolment.age_review_error_note_too_short');
    expect(mapAgeReviewRpcError('Forbidden')).toBe('pages.enrolment.age_review_error_forbidden');
    expect(mapAgeReviewRpcError('something else')).toBe('pages.enrolment.age_review_error_generic');
  });
});
