import type { FormEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { bindFormSubmit } from '@/lib/bindFormSubmit';

describe('bindFormSubmit', () => {
  it('always prevents native form navigation', () => {
    const onValid = vi.fn();
    const handleSubmit = vi.fn((valid) => () => {
      valid({ password: 'Secret1' });
    });

    const event = {
      preventDefault: vi.fn(),
    } as unknown as FormEvent<HTMLFormElement>;

    bindFormSubmit(handleSubmit, onValid)(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(onValid).toHaveBeenCalledOnce();
  });
});
