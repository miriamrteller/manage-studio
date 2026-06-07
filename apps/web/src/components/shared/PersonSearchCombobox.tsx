import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { usePersonSearch } from '@/hooks/usePersonSearch';
import { formatPersonSearchAgeLine } from '@/lib/personAge';
import type { PersonSearchResult } from '@/features/people/types';
import type { Person } from '@shared/schemas';

export interface PersonSearchComboboxProps {
  onSelect: (person: Person, result: PersonSearchResult) => void;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
  emptyMessage?: string;
  /** Filter which results appear in the list (default: show all). */
  filterResults?: (results: PersonSearchResult[]) => PersonSearchResult[];
  /** Whether a result can be chosen (default: all results selectable). */
  isSelectable?: (result: PersonSearchResult) => boolean;
  /** Shown under a result when isSelectable returns false. */
  renderIneligibleHint?: (result: PersonSearchResult) => ReactNode;
  /** Optional badge beside the result name (e.g. Student / Family). */
  renderResultBadge?: (result: PersonSearchResult) => ReactNode;
  /** Override default subtitle line (name is always shown as the title). */
  renderSubtitle?: (result: PersonSearchResult) => ReactNode;
}

function defaultSubtitle(result: PersonSearchResult, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const age = formatPersonSearchAgeLine(result.person.date_of_birth, t);
  return [
    age,
    result.person.email,
    result.accountName,
    result.guardianName ? t('person_search.guardian', { name: result.guardianName }) : null,
    result.guardianEmail,
    result.guardianPhone ?? result.emergencyContactPhone,
    result.activeClassNames.length > 0
      ? t('person_search.enrolled_in', { classes: result.activeClassNames.join(', ') })
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function PersonSearchCombobox({
  onSelect,
  disabled = false,
  label,
  placeholder,
  emptyMessage,
  filterResults,
  isSelectable = () => true,
  renderIneligibleHint,
  renderResultBadge,
  renderSubtitle,
}: PersonSearchComboboxProps) {
  const { t } = useTranslation();
  const inputId = useId();
  const listboxId = `${inputId}-listbox`;
  const containerRef = useRef<HTMLDivElement>(null);

  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const { results, isSearching } = usePersonSearch(inputValue, isOpen && !disabled);

  const visibleResults = useMemo(
    () => (filterResults ? filterResults(results) : results),
    [results, filterResults],
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [visibleResults.length]);

  const handleSelect = (result: PersonSearchResult) => {
    if (!isSelectable(result)) return;
    onSelect(result.person, result);
    setInputValue('');
    setIsOpen(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || visibleResults.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, visibleResults.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const result = visibleResults[activeIndex];
      if (result) handleSelect(result);
    } else if (event.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative space-y-1">
      <label htmlFor={inputId} className="block text-sm font-medium">
        {label ?? t('person_search.label')}
      </label>
      <input
        id={inputId}
        type="search"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-autocomplete="list"
        disabled={disabled}
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder ?? t('person_search.placeholder')}
        className="form-input w-full"
      />
      {isOpen && inputValue.trim() && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-lg"
        >
          {isSearching && (
            <li className="px-3 py-2 text-sm text-gray-500" role="presentation">
              {t('common.loading')}
            </li>
          )}
          {!isSearching && visibleResults.length === 0 && (
            <li className="px-3 py-2 text-sm text-gray-500" role="presentation">
              {emptyMessage ?? t('person_search.empty')}
            </li>
          )}
          {visibleResults.map((result, index) => {
            const selectable = isSelectable(result);
            const ineligibleHint = !selectable ? renderIneligibleHint?.(result) : null;
            const subtitle = renderSubtitle
              ? (renderSubtitle(result) ?? defaultSubtitle(result, t))
              : defaultSubtitle(result, t);
            const badge = renderResultBadge?.(result);

            return (
              <li key={result.person.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  disabled={!selectable}
                  onClick={() => handleSelect(result)}
                  className={`w-full px-3 py-2 text-start text-sm ${
                    index === activeIndex ? 'bg-blue-50' : 'hover:bg-gray-50'
                  } ${!selectable ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{result.person.name}</span>
                    {badge && (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-normal text-gray-600">
                        {badge}
                      </span>
                    )}
                  </span>
                  {subtitle && (
                    <span className="block text-xs text-gray-600">{subtitle}</span>
                  )}
                  {ineligibleHint && (
                    <span className="block text-xs text-amber-700">{ineligibleHint}</span>
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
