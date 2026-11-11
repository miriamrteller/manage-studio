import { describe, expect, it } from 'vitest';
import { signInTokenFromHash } from '@/features/auth/lib/clientSignIn';

describe('booking email sign-in link', () => {
  it('reads the token from the fragment', () => {
    const token = 'A'.repeat(43);
    expect(signInTokenFromHash(`#t=${token}`)).toBe(token);
  });

  it('ignores a missing or malformed token', () => {
    expect(signInTokenFromHash('')).toBeNull();
    expect(signInTokenFromHash('#t=short')).toBeNull();
    expect(signInTokenFromHash('#t=<script>alert(1)</script>xxxxxxxxxxxxxxxxxxxxxxxxx')).toBeNull();
  });
});
