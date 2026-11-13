import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { groupNavEntries, resolveActiveTab } from './navigationConfig';
import { useVisibleNav } from './useVisibleNav';

/**
 * The tabs along the top of an area's pages (owner, 13 Nov 2026: no submenus; each area is one
 * menu line and its pages are tabs). Shows only when the area has two or more pages for this
 * studio. Each tab is a link to its own page, so it can be bookmarked and opened in a new tab.
 */
export function AreaTabs() {
  const { t } = useTranslation();
  const { pathname, search } = useLocation();
  const { sections, navLabel, entryLabel } = useVisibleNav();

  const entries = sections.flatMap((section) => groupNavEntries(section.items)).filter((e) => e.area);
  let found: { entry: (typeof entries)[number]; activePath: string } | null = null;
  for (const entry of entries) {
    const tab = resolveActiveTab(pathname, search, entry.items);
    if (tab && (!found || tab.path.length > found.activePath.length)) {
      found = { entry, activePath: tab.path };
    }
  }
  if (!found || found.entry.items.length < 2) return null;
  const { entry, activePath } = found;

  return (
    <nav
      aria-label={t('nav.area_tabs', { area: entryLabel(entry) })}
      className="mb-6 -mt-2 flex gap-1 overflow-x-auto border-b border-border"
    >
      {entry.items.map((item) => {
        const active = item.path === activePath;
        return (
          <Link
            key={item.path}
            to={item.path}
            aria-current={active ? 'page' : undefined}
            className={cn(
              '-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium focus-visible:outline-2 outline-offset-2',
              active
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {navLabel(item)}
          </Link>
        );
      })}
    </nav>
  );
}
