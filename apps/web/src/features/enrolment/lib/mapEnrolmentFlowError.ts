import type { TFunction } from 'i18next';

function isAlreadyEnrolledMessage(message: string): boolean {
  return /already enrolled/i.test(message);
}

export function mapEnrolmentFlowError(
  error: unknown,
  t: TFunction,
  mode?: string,
): string {
  if (!(error instanceof Error)) {
    return t('enrolment.checkout_prepare_failed');
  }

  if (isAlreadyEnrolledMessage(error.message)) {
    return mode === 'admin'
      ? t('pages.enrolment.already_enrolled_preselected_admin')
      : t('pages.enrolment.already_enrolled_preselected');
  }

  return error.message;
}
