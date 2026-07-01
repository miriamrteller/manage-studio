import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NavItem, NavSection, NavSectionKey } from './navigationConfig';

interface NavDrawerMenuProps {
  sections: NavSection[];
  activePath: string | null;
  onNavigate: (path: string) => void;
  navLabel: (item: NavItem) => string;
}

function sectionContainsPath(section: NavSection, path: string | null): boolean {
  if (!path) return false;
  return section.items.some((item) => item.path === path);
}

export function NavDrawerMenu({
  sections,
  activePath,
  onNavigate,
  navLabel,
}: NavDrawerMenuProps) {
  const { t } = useTranslation();
  const [expandedSections, setExpandedSections] = useState<Set<NavSectionKey>>(() => {
    const initial = new Set<NavSectionKey>();
    for (const section of sections) {
      if (sectionContainsPath(section, activePath)) {
        initial.add(section.sectionKey);
      }
    }
    return initial;
  });

  useEffect(() => {
    const activeSection = sections.find((section) => sectionContainsPath(section, activePath));
    if (!activeSection) return;

    setExpandedSections((prev) => {
      if (prev.has(activeSection.sectionKey)) return prev;
      const next = new Set(prev);
      next.add(activeSection.sectionKey);
      return next;
    });
  }, [activePath, sections]);

  const toggleSection = (sectionKey: NavSectionKey) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionKey)) {
        next.delete(sectionKey);
      } else {
        next.add(sectionKey);
      }
      return next;
    });
  };

  return (
    <nav className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain py-1" aria-label={t('nav.menu')}>
      {sections.map((section) => {
        const expanded = expandedSections.has(section.sectionKey);
        const sectionPanelId = `nav-section-${section.sectionKey}`;

        return (
          <div key={section.sectionKey} className="border-b border-primary-active/40 last:border-b-0">
            <button
              type="button"
              onClick={() => toggleSection(section.sectionKey)}
              aria-expanded={expanded}
              aria-controls={sectionPanelId}
              className={cn(
                'flex w-full items-center justify-between gap-2 px-4 py-2.5 text-sm font-medium transition-colors',
                'hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-on-primary focus-visible:outline-offset-[-2px]',
              )}
            >
              <span>{t(section.labelKey)}</span>
              <ChevronDown
                size={16}
                aria-hidden
                className={cn(
                  'shrink-0 opacity-80 transition-transform duration-200',
                  !expanded && 'ltr:-rotate-90 rtl:rotate-90',
                )}
              />
            </button>

            {expanded && (
              <ul id={sectionPanelId}>
                {section.items.map((item) => {
                  const active = activePath === item.path;
                  return (
                    <li key={item.path}>
                      <button
                        type="button"
                        onClick={() => onNavigate(item.path)}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'w-full text-start py-2 text-sm transition-colors',
                          item.indent ? 'ps-8 pe-4' : 'px-4',
                          'hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-on-primary focus-visible:outline-offset-[-2px]',
                          active && 'bg-primary-hover font-medium',
                        )}
                      >
                        {navLabel(item)}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}
