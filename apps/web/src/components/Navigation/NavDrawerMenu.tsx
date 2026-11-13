import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { groupNavEntries, type NavEntry, type NavItem, type NavSection } from './navigationConfig';
import { navEntryIcon } from './navIcons';

interface NavDrawerMenuProps {
  sections: NavSection[];
  activePath: string | null;
  onNavigate: (path: string) => void;
  /** A menu line's name. */
  entryLabel: (entry: NavEntry) => string;
  /** Grey the item out (visible but not clickable), e.g. booking turned off. */
  isItemDisabled?: (item: NavItem) => boolean;
  /** Icons only: names are hidden (still read out, and shown on hover). */
  iconsOnly?: boolean;
  vertical?: string | null;
}

/**
 * One flat list, no groups to open: each line is an area of the studio (its pages are tabs
 * along the top of the page) or a page of its own. Sections are only separated by a rule.
 */
export function NavDrawerMenu({
  sections,
  activePath,
  onNavigate,
  entryLabel,
  isItemDisabled,
  iconsOnly = false,
  vertical,
}: NavDrawerMenuProps) {
  const { t } = useTranslation();

  return (
    <nav className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain py-1" aria-label={t('nav.menu')}>
      {sections.map((section) => {
        const entries = groupNavEntries(section.items);
        return (
          <div key={section.sectionKey} className="border-b border-[var(--nav-border)] last:border-b-0 py-1">
            <ul>
              {entries.map((entry) => {
                const active = entry.items.some((item) => item.path === activePath);
                const disabled = entry.items.every((item) => isItemDisabled?.(item) ?? false);
                const label = entryLabel(entry);
                const Icon = navEntryIcon(entry, vertical);
                return (
                  <li key={entry.key}>
                    <button
                      type="button"
                      disabled={disabled}
                      title={disabled ? t('nav.booking_disabled_hint') : iconsOnly ? label : undefined}
                      aria-label={iconsOnly ? label : undefined}
                      onClick={() => onNavigate(entry.path)}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex w-full items-center gap-3 py-2.5 text-start text-sm font-medium transition-colors',
                        iconsOnly ? 'justify-center px-0' : 'px-4',
                        'focus-visible:outline-2 focus-visible:outline-[var(--nav-text)] focus-visible:outline-offset-[-2px]',
                        disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[var(--nav-hover)]',
                        active && 'bg-[var(--nav-active)]',
                      )}
                    >
                      <Icon size={20} aria-hidden className="shrink-0" />
                      {!iconsOnly && <span className="truncate">{label}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
