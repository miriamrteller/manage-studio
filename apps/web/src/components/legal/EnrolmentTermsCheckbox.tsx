import { useId } from 'react';
import { useTranslation } from 'react-i18next';

export interface EnrolmentTermsCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  termsUrl: string | null;
  privacyUrl: string | null;
  disabled?: boolean;
  /** Admin attesting for the parent (different wording, docs/legal/09 §1 note). */
  variant?: 'parent' | 'admin';
}

function LinkOrText({ href, label }: { href: string | null; label: string }) {
  if (!href) return <span>{label}</span>;
  return (
    <a href={href} className="underline" target="_blank" rel="noopener noreferrer">
      {label}
    </a>
  );
}

/**
 * "I have read and agree to the Enrolment Terms and have read the Privacy Policy."
 * Unticked by default; "agree" for terms and "read" for privacy are kept distinct.
 */
export function EnrolmentTermsCheckbox({
  checked,
  onChange,
  termsUrl,
  privacyUrl,
  disabled,
  variant = 'parent',
}: EnrolmentTermsCheckboxProps) {
  const { t } = useTranslation();
  const id = useId();
  const prefix = variant === 'admin' ? 'legal.terms_checkbox_admin' : 'legal.terms_checkbox';

  return (
    <div className="flex items-start gap-2 text-sm">
      <input
        id={id}
        type="checkbox"
        className="mt-1"
        checked={checked}
        disabled={disabled}
        required
        aria-required="true"
        onChange={(e) => onChange(e.target.checked)}
      />
      <label htmlFor={id}>
        {t(`${prefix}.before`)}{' '}
        <LinkOrText href={termsUrl} label={t('legal.terms_link')} />{' '}
        {t(`${prefix}.middle`)}{' '}
        <LinkOrText href={privacyUrl} label={t('legal.privacy_policy')} />
        {t(`${prefix}.after`)}
      </label>
    </div>
  );
}
