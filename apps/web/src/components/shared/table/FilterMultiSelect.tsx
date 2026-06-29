import { useTranslation } from 'react-i18next';

export interface FilterOption {
  value: string;
  label: string;
}

interface FilterMultiSelectProps {
  id: string;
  label: string;
  options: FilterOption[];
  selected: FilterOption[];
  onChange: (selected: FilterOption[]) => void;
  placeholder?: string;
  className?: string;
}

export function FilterMultiSelect({
  id,
  label,
  options,
  selected,
  onChange,
  placeholder,
  className = 'w-full',
}: FilterMultiSelectProps) {
  const { t } = useTranslation();
  const selectedIds = new Set(selected.map((s) => s.value));
  const available = options.filter((opt) => !selectedIds.has(opt.value));

  const handleAdd = (value: string) => {
    if (!value) return;
    const opt = options.find((o) => o.value === value);
    if (opt && !selectedIds.has(value)) {
      onChange([...selected, opt]);
    }
  };

  const handleRemove = (value: string) => {
    onChange(selected.filter((s) => s.value !== value));
  };

  return (
    <div className={className}>
      <span id={`${id}-label`} className="block text-sm font-medium mb-1">
        {label}
      </span>

      {available.length > 0 ? (
        <select
          id={id}
          value=""
          onChange={(e) => handleAdd(e.target.value)}
          className="w-full form-input"
          aria-labelledby={`${id}-label`}
        >
          <option value="">{placeholder ?? t('common.filters.add')}</option>
          {available.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : (
        options.length > 0 && (
          <p className="text-xs text-gray-500">{t('common.filters.all_selected')}</p>
        )
      )}

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2" aria-labelledby={`${id}-label`}>
          {selected.map((item) => (
            <span
              key={item.value}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs border"
              style={{ borderColor: 'var(--color-border-default)' }}
            >
              {item.label}
              <button
                type="button"
                onClick={() => handleRemove(item.value)}
                className="text-gray-500 hover:text-gray-800"
                aria-label={`${t('common.remove')} ${item.label}`}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
