import { useTranslation } from 'react-i18next';
import { useTenant } from '@/hooks/useTenant';
import { formatCurrency } from '@shared/format';
import type { JobPackage } from '../services/jobService';

interface PackageSelectProps {
  id: string;
  label: string;
  packages: JobPackage[];
  value: string;
  onChange: (offeringId: string) => void;
  required?: boolean;
  disabled?: boolean;
}

/** Package (appointment offering) picker with price, shared by create + convert forms. */
export function PackageSelect({ id, label, packages, value, onChange, required, disabled }: PackageSelectProps) {
  const { t } = useTranslation();
  const tenant = useTenant();
  const locale = tenant?.locale ?? 'he-IL';
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium mb-1">
        {label}
      </label>
      <select
        id={id}
        className="w-full border rounded px-3 py-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        disabled={disabled}
      >
        <option value="">{t('common.select')}</option>
        {packages.map((pkg) => (
          <option key={pkg.id} value={pkg.id}>
            {pkg.name} · {formatCurrency(pkg.price_minor, pkg.currency, locale)}
          </option>
        ))}
      </select>
    </div>
  );
}
