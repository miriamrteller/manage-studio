import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import type { BlastAccountSearchResult } from '../lib/notificationBlastSchema';
import { useAccountBlastSearch } from '../hooks/useAccountBlastSearch';

interface AccountBlastPickerProps {
  accountId?: string;
  selectedLabel?: string | null;
  onSelect: (account: BlastAccountSearchResult) => void;
  onClear: () => void;
  disabled?: boolean;
}

function formatAccountLabel(account: BlastAccountSearchResult): string {
  const familyName = account.account_name?.trim();
  const contactName = account.contact_name?.trim();
  const email = account.contact_email?.trim();

  if (familyName && contactName && email) {
    return `${familyName} — ${contactName} (${email})`;
  }
  if (contactName && email) {
    return `${contactName} (${email})`;
  }
  if (email) {
    return email;
  }
  return familyName || contactName || account.account_id;
}

export function AccountBlastPicker({
  accountId,
  selectedLabel,
  onSelect,
  onClear,
  disabled = false,
}: AccountBlastPickerProps) {
  const { t } = useTranslation();
  const inputId = useId();
  const listboxId = `${inputId}-listbox`;
  const containerRef = useRef<HTMLDivElement>(null);

  const [inputValue, setInputValue] = useState(selectedLabel ?? '');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const searchEnabled = isOpen && !disabled && !accountId;
  const { results, isSearching } = useAccountBlastSearch(inputValue, searchEnabled);

  useEffect(() => {
    if (accountId && selectedLabel) {
      setInputValue(selectedLabel);
    } else if (!accountId) {
      setInputValue('');
    }
  }, [accountId, selectedLabel]);

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
  }, [results.length]);

  const handleSelect = (account: BlastAccountSearchResult) => {
    onSelect(account);
    setInputValue(formatAccountLabel(account));
    setIsOpen(false);
  };

  const handleClear = () => {
    onClear();
    setInputValue('');
    setIsOpen(false);
  };

  const handleInputChange = (value: string) => {
    if (accountId) {
      onClear();
    }
    setInputValue(value);
    setIsOpen(true);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (accountId) {
      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        handleClear();
      }
      return;
    }

    if (!isOpen || results.length === 0) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const result = results[activeIndex];
      if (result) {
        handleSelect(result);
      }
    } else if (event.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const showListbox = isOpen && !accountId && inputValue.trim().length >= 1;

  return (
    <div ref={containerRef} className="relative space-y-1">
      <label htmlFor={inputId} className="block text-sm font-medium">
        {t('pages.notifications.account_label')}
      </label>

      <div className="relative">
        <input
          id={inputId}
          type="search"
          role="combobox"
          aria-expanded={showListbox}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            showListbox && results[activeIndex]
              ? `${listboxId}-option-${results[activeIndex].account_id}`
              : undefined
          }
          disabled={disabled}
          value={inputValue}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={t('pages.notifications.account_search_placeholder')}
          className="form-input w-full pe-9"
          autoComplete="off"
        />

        {accountId && (
          <button
            type="button"
            onClick={handleClear}
            disabled={disabled}
            className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            aria-label={t('common.clear')}
          >
            <X size={16} aria-hidden />
          </button>
        )}
      </div>

      {showListbox && (
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
          {!isSearching && results.length === 0 && (
            <li className="px-3 py-2 text-sm text-gray-500" role="presentation">
              {t('pages.notifications.account_search_empty')}
            </li>
          )}
          {!isSearching &&
            results.map((account, index) => {
              const familyName = account.account_name?.trim();
              const contactName = account.contact_name?.trim();
              const email = account.contact_email?.trim();
              const title = familyName || contactName || email || account.account_id;
              const subtitle = [familyName && contactName ? contactName : null, email]
                .filter(Boolean)
                .join(' · ');

              return (
              <li key={account.account_id} role="presentation">
                <button
                  type="button"
                  id={`${listboxId}-option-${account.account_id}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => handleSelect(account)}
                  className={`w-full px-3 py-2 text-start text-sm ${
                    index === activeIndex ? 'bg-blue-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <span className="font-medium">{title}</span>
                  {subtitle && subtitle !== title && (
                    <span className="block text-xs text-gray-600">{subtitle}</span>
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

export { formatAccountLabel };
