import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';

export interface SettingsSection {
  id: string;
  label: string;
  labelHe?: string;
  icon: LucideIcon;
  component: React.ComponentType;
}

interface SettingsLayoutProps {
  sections: SettingsSection[];
  activeSectionId: string;
  onSectionChange: (id: string) => void;
}

export function SettingsLayout({
  sections,
  activeSectionId,
  onSectionChange,
}: SettingsLayoutProps) {
  const { t } = useTranslation();
  const { language: currentLanguage } = useLanguage();
  const direction = currentLanguage === 'he' ? 'rtl' : 'ltr';
  const isRTL = direction === 'rtl';

  const activeSection = sections.find((s) => s.id === activeSectionId) ?? sections[0];
  const ActiveComponent = activeSection?.component;

  const getLabel = useCallback(
    (section: SettingsSection): string => {
      if (currentLanguage === 'he' && section.labelHe) {
        return section.labelHe;
      }
      return section.label;
    },
    [currentLanguage]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const currentIndex = sections.findIndex((s) => s.id === activeSectionId);
      if (currentIndex === -1) return;

      let nextIndex: number | null = null;

      switch (event.key) {
        case 'ArrowUp':
        case 'ArrowLeft':
          event.preventDefault();
          nextIndex = currentIndex > 0 ? currentIndex - 1 : sections.length - 1;
          break;
        case 'ArrowDown':
        case 'ArrowRight':
          event.preventDefault();
          nextIndex = currentIndex < sections.length - 1 ? currentIndex + 1 : 0;
          break;
        case 'Home':
          event.preventDefault();
          nextIndex = 0;
          break;
        case 'End':
          event.preventDefault();
          nextIndex = sections.length - 1;
          break;
      }

      if (nextIndex !== null) {
        onSectionChange(sections[nextIndex].id);
      }
    },
    [sections, activeSectionId, onSectionChange]
  );

  return (
    <div
      className="flex flex-col md:flex-row min-h-0 flex-1"
      style={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      {/* Desktop Sidebar */}
      <div
        role="tablist"
        tabIndex={0}
        aria-label={t('settings.navigation', 'Settings Navigation')}
        onKeyDown={handleKeyDown}
        className="hidden md:flex flex-col w-[220px] bg-[--surface-raised] border-[--border-subtle] flex-shrink-0"
        style={{
          borderInlineEndWidth: '1px',
        }}
      >
        {sections.map((section) => {
          const Icon = section.icon;
          const isActive = section.id === activeSectionId;

          return (
            <button
              key={section.id}
              id={`tab-${section.id}`}
              role="tab"
              aria-selected={isActive}
              aria-controls={`tabpanel-${section.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onSectionChange(section.id)}
              className={`
                flex items-center gap-2 px-4 py-3 cursor-pointer text-start
                transition-colors duration-150 focus:outline-none focus-visible:ring-2 
                focus-visible:ring-[--color-primary] focus-visible:ring-inset
                ${
                  isActive
                    ? 'bg-[--state-hover] text-[--color-primary]'
                    : 'text-[--text-secondary] hover:bg-[--state-hover] hover:text-[--text-primary]'
                }
              `}
              style={{
                borderInlineStartWidth: isActive ? '4px' : '4px',
                borderInlineStartColor: isActive ? 'var(--color-primary)' : 'transparent',
              }}
            >
              <Icon size={20} className="flex-shrink-0" />
              <span className="truncate">{getLabel(section)}</span>
            </button>
          );
        })}
      </div>

      {/* Mobile Tab Strip */}
      <div
        role="tablist"
        tabIndex={0}
        aria-label={t('settings.navigation', 'Settings Navigation')}
        onKeyDown={handleKeyDown}
        className="md:hidden flex overflow-x-auto bg-[--surface-raised] border-b border-[--border-subtle] -mx-4 px-4"
        style={{ scrollbarWidth: 'none' }}
      >
        {sections.map((section) => {
          const Icon = section.icon;
          const isActive = section.id === activeSectionId;

          return (
            <button
              key={section.id}
              id={`tab-mobile-${section.id}`}
              role="tab"
              aria-selected={isActive}
              aria-controls={`tabpanel-${section.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onSectionChange(section.id)}
              className={`
                flex items-center gap-2 px-4 py-3 cursor-pointer whitespace-nowrap
                transition-colors duration-150 focus:outline-none focus-visible:ring-2
                focus-visible:ring-[--color-primary] focus-visible:ring-inset
                border-b-2
                ${
                  isActive
                    ? 'border-[--color-primary] text-[--color-primary]'
                    : 'border-transparent text-[--text-secondary] hover:text-[--text-primary]'
                }
              `}
            >
              <Icon size={18} className="flex-shrink-0" />
              <span>{getLabel(section)}</span>
            </button>
          );
        })}
      </div>

      {/* Content Panel */}
      <div
        id={`tabpanel-${activeSectionId}`}
        role="tabpanel"
        aria-labelledby={`tab-${activeSectionId}`}
        tabIndex={0}
        className="flex-1 p-6 md:p-8 overflow-y-auto"
      >
        {ActiveComponent && <ActiveComponent />}
      </div>
    </div>
  );
}