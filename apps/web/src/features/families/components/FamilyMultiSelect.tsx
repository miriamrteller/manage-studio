import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FilterOption } from '@/components/shared/table/FilterMultiSelect';
import { useFamilySearch } from '../hooks/useFamilySearch';
import type { Account } from '@shared/schemas';

function familyLabel(family: Account): string {
  return family.name ?? family.contact_person_name ?? family.contact_email ?? family.id;
}

interface FamilyMultiSelectProps {
  selected: FilterOption[];
  onChange: (selected: FilterOption[]) => void;
  id?: string;
}

export function FamilyMultiSelect({ selected, onChange, id }: FamilyMultiSelectProps) {
  const { t } = useTranslation();
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listboxId = `${inputId}-listbox`;

  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedIds = new Set(selected.map((s) => s.value));

  const { families, isSearching } = useFamilySearch(inputValue, {
    enabled: isOpen,
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (family: Account) => {
    onChange([...selected, { value: family.id, label: familyLabel(family) }]);
    setInputValue('');
    setIsOpen(false);
  };

  const handleToggle = (family: Account) => {
    if (selectedIds.has(family.id)) {
      handleRemove(family.id);
    } else {
      handleSelect(family);
    }
  };

  const handleRemove = (value: string) => {
    onChange(selected.filter((s) => s.value !== value));
  };

  return (
    <div ref={containerRef} className="relative space-y-1">
      <span id={`${inputId}-label`} className="block text-sm font-medium">
        {t('pages.students.filter_by_family')}
      </span>

      {selected.length > 0 && (
        <div
          className="flex flex-wrap gap-2 mb-2"
          role="group"
          aria-label={t('pages.students.filter_by_family_selected')}
        >
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

      <input
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-labelledby={`${inputId}-label`}
        placeholder={t('pages.students.family_search_placeholder')}
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        className="form-input w-full"
        autoComplete="off"
      />

      {isOpen && inputValue.trim().length >= 1 && (
        <ul
          id={listboxId}
          role="listbox"
          aria-multiselectable="true"
          aria-labelledby={`${inputId}-label`}
          className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto rounded-md border bg-white shadow-lg"
          style={{ borderColor: 'var(--color-border-default)' }}
        >
          {isSearching && (
            <li className="px-3 py-2 text-sm text-gray-500" role="presentation">
              {t('common.loading')}
            </li>
          )}
          {!isSearching && families.length === 0 && (
            <li className="px-3 py-2 text-sm text-gray-500" role="presentation">
              {t('common.no_results_found')}
            </li>
          )}
          {!isSearching &&
            families.map((family) => {
              const isSelected = selectedIds.has(family.id);
              return (
                <li key={family.id} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    className={`w-full px-3 py-2 text-start text-sm hover:bg-gray-50 ${
                      isSelected ? 'bg-gray-50 font-medium' : ''
                    }`}
                    onClick={() => handleToggle(family)}
                    aria-pressed={isSelected}
                  >
                    <span className="font-medium">{familyLabel(family)}</span>
                    {family.contact_person_name && family.name && (
                      <span className="block text-xs text-gray-500">{family.contact_person_name}</span>
                    )}
                  </button>
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}
