import { useTranslation } from 'react-i18next';
import { providerLimitKeys, type ProviderLimitKind } from '@/lib/providerLimits';

interface ProviderLimitsProps {
  kind: ProviderLimitKind;
  slug: string | null | undefined;
  /** Lets the option's radio point at these lines (aria-describedby). */
  id: string;
  className?: string;
}

/** "What it can't do": short lines under a provider option. Information only, never a block. */
export function ProviderLimits({ kind, slug, id, className = '' }: ProviderLimitsProps) {
  const { t } = useTranslation();
  const keys = providerLimitKeys(kind, slug);
  if (keys.length === 0) return null;
  return (
    <ul id={id} className={`list-disc space-y-0.5 ps-5 text-xs text-gray-700 ${className}`}>
      {keys.map((key) => (
        <li key={key}>{t(key)}</li>
      ))}
    </ul>
  );
}
