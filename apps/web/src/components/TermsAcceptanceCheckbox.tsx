import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useTenant } from '@/hooks/useTenant';
import { resolveLegalLinks } from '@/lib/legalLinks';

/**
 * Required "I accept the terms" checkbox before payment (docs/legal 09 §1, 07a).
 * Renders nothing, and counts as accepted, when the studio has no terms URL yet,
 * so a studio without published terms is not blocked from enrolling anyone.
 */
export function useTermsRequired(): boolean {
  const tenant = useTenant();
  return Boolean(resolveLegalLinks(tenant).terms);
}

export function TermsAcceptanceCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const { t } = useTranslation();
  const tenant = useTenant();
  const id = useId();
  const { terms, privacy } = resolveLegalLinks(tenant);
  if (!terms) return null;

  return (
    <div className="flex items-start gap-2 rounded-lg border border-border p-3">
      <input
        id={id}
        type="checkbox"
        className="mt-1 h-4 w-4"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-required="true"
      />
      <label htmlFor={id} className="text-sm text-foreground">
        {t('legal.accept_terms_prefix')}{' '}
        <a href={terms} target="_blank" rel="noopener noreferrer" className="underline">
          {t('legal.terms_link')}
        </a>
        {privacy ? (
          <>
            {' '}
            {t('legal.accept_terms_and_privacy')}{' '}
            <a href={privacy} target="_blank" rel="noopener noreferrer" className="underline">
              {t('footer.privacy')}
            </a>
          </>
        ) : null}
      </label>
    </div>
  );
}
