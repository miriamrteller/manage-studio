import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

export interface ActiveFilterChip {
  key: string;
  label: string;
  onRemove: () => void;
}

interface FilterDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  activeCount: number;
  onClearAll?: () => void;
  children: ReactNode;
}

export function FilterDrawer({
  open,
  onClose,
  title,
  activeCount,
  onClearAll,
  children,
}: FilterDrawerProps) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/30"
        aria-label={t('common.close')}
        onClick={onClose}
      />
      <aside
        className="fixed inset-y-0 end-0 z-50 w-full max-w-sm bg-white shadow-xl flex flex-col"
        aria-label={title}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            {activeCount > 0 && (
              <p className="text-xs text-gray-500">
                {t('common.filters.active_count', { count: activeCount })}
              </p>
            )}
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label={t('common.close')}>
            ✕
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">{children}</div>

        <div className="border-t px-4 py-3 flex gap-2">
          {activeCount > 0 && onClearAll && (
            <Button type="button" variant="outline" className="flex-1" onClick={onClearAll}>
              {t('common.filters.clear_all')}
            </Button>
          )}
          <Button type="button" variant="primary" className="flex-1" onClick={onClose}>
            {t('common.filters.apply')}
          </Button>
        </div>
      </aside>
    </>
  );
}

interface FilterToolbarProps {
  onOpenFilters: () => void;
  activeFilterCount: number;
  searchSlot?: ReactNode;
  actions?: ReactNode;
  activeFilters?: ActiveFilterChip[];
}

export function FilterToolbar({
  onOpenFilters,
  activeFilterCount,
  searchSlot,
  actions,
  activeFilters = [],
}: FilterToolbarProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3 items-end">
        {searchSlot && <div className="flex-1 min-w-48">{searchSlot}</div>}
        <Button type="button" variant="outline" onClick={onOpenFilters} className="relative">
          {t('common.filters.open')}
          {activeFilterCount > 0 && (
            <span
              className="absolute -top-2 -end-2 min-w-5 h-5 px-1 rounded-full text-xs font-medium text-white flex items-center justify-center"
              style={{ backgroundColor: 'var(--color-info)' }}
            >
              {activeFilterCount}
            </span>
          )}
        </Button>
        {actions}
      </div>

      {activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          {activeFilters.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs border"
              style={{ borderColor: 'var(--color-border-default)' }}
            >
              {chip.label}
              <button
                type="button"
                onClick={chip.onRemove}
                className="text-gray-500 hover:text-gray-800"
                aria-label={t('common.clear')}
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
