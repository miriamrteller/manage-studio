import type { FormEvent } from 'react';
import type { FieldErrors, UseFormHandleSubmit } from 'react-hook-form';

/** Block native GET submits (passwords in URL) and delegate to react-hook-form. */
export function bindFormSubmit<TFieldValues extends Record<string, unknown>>(
  handleSubmit: UseFormHandleSubmit<TFieldValues>,
  onValid: (data: TFieldValues) => void | Promise<void>,
  onInvalid?: (errors: FieldErrors<TFieldValues>) => void,
) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handleSubmit(onValid, onInvalid)(event);
  };
}
