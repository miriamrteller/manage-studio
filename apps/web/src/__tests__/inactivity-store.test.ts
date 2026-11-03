// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LAST_ACTIVITY_KEY,
  clearLastActivity,
  isInactive,
  markSignedOutForInactivity,
  readLastActivity,
  recordActivity,
  SIGNED_OUT_KEY,
} from '@/lib/inactivity/activityStore';
import { INACTIVITY_LIMIT_MINUTES, INACTIVITY_LIMIT_MS } from '@/lib/inactivity/config';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('the limit', () => {
  it('is one hour, set in one place', () => {
    expect(INACTIVITY_LIMIT_MINUTES).toBe(60);
    expect(INACTIVITY_LIMIT_MS).toBe(60 * 60 * 1000);
  });
});

describe('last-activity time', () => {
  it('is stored in localStorage so every tab shares it', () => {
    expect(readLastActivity()).toBeNull();
    recordActivity(1234567);
    expect(localStorage.getItem(LAST_ACTIVITY_KEY)).toBe('1234567');
    expect(readLastActivity()).toBe(1234567);
    clearLastActivity();
    expect(readLastActivity()).toBeNull();
  });

  it('ignores junk in storage', () => {
    for (const junk of ['', 'abc', '0', '-5', 'NaN']) {
      localStorage.setItem(LAST_ACTIVITY_KEY, junk);
      expect(readLastActivity()).toBeNull();
    }
  });

  it('survives storage that throws (private window, blocked site data)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readLastActivity()).toBeNull();
    expect(() => recordActivity(1)).not.toThrow();
    expect(() => clearLastActivity()).not.toThrow();
    expect(() => markSignedOutForInactivity(1)).not.toThrow();
  });

  it('records that a sign-out for inactivity happened (read by the other tabs)', () => {
    markSignedOutForInactivity(42);
    expect(localStorage.getItem(SIGNED_OUT_KEY)).toBe('42');
  });
});

describe('isInactive', () => {
  const hour = 60 * 60 * 1000;
  it('is true only when MORE than the limit has passed', () => {
    expect(isInactive(1000 + hour, 1000)).toBe(false);
    expect(isInactive(1000 + hour + 1, 1000)).toBe(true);
    expect(isInactive(1000 + hour - 1, 1000)).toBe(false);
  });

  it('never calls a missing time inactive (a first run must not sign anyone out)', () => {
    expect(isInactive(Date.now(), null)).toBe(false);
  });

  it('takes the limit as a parameter', () => {
    expect(isInactive(10_000, 0, 5_000)).toBe(true);
    expect(isInactive(4_000, 0, 5_000)).toBe(false);
  });
});
