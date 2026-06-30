import { describe, expect, it } from 'vitest';
import { createSetPasswordFormSchema } from '@/schemas/auth';
import { sessionUsedPassword } from '@/features/auth/lib/sessionAuthMethod';

const t = (key: string) => key;

function fakeAccessToken(payload: Record<string, unknown>): string {
  const encode = (value: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.sig`;
}

describe('createSetPasswordFormSchema', () => {
  it('accepts a valid new password when current is not required', () => {
    const schema = createSetPasswordFormSchema(t, false);
    const result = schema.safeParse({
      password: 'Secret1',
      confirmPassword: 'Secret1',
    });
    expect(result.success).toBe(true);
  });

  it('rejects mismatched confirmation', () => {
    const schema = createSetPasswordFormSchema(t, false);
    const result = schema.safeParse({
      password: 'Secret1',
      confirmPassword: 'Secret2',
    });
    expect(result.success).toBe(false);
  });

  it('requires current password when changing an existing password', () => {
    const schema = createSetPasswordFormSchema(t, true);
    const result = schema.safeParse({
      password: 'Secret1',
      confirmPassword: 'Secret1',
    });
    expect(result.success).toBe(false);
  });
});

describe('sessionUsedPassword', () => {
  it('detects password-based sessions from JWT amr', () => {
    expect(
      sessionUsedPassword({
        access_token: fakeAccessToken({ amr: [{ method: 'pwd' }] }),
      } as never),
    ).toBe(true);
  });

  it('returns false for magic-link sessions', () => {
    expect(
      sessionUsedPassword({
        access_token: fakeAccessToken({ amr: [{ method: 'otp' }] }),
      } as never),
    ).toBe(false);
  });
});
