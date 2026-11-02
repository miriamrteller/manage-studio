import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/** /admin/leads/get, /forms and /help all belong to "Get leads". */
export function leadsTabFor(pathname: string): 'leads' | 'get' {
  return /^\/admin\/leads\/(get|forms|help)(\/|$)/.test(pathname) ? 'get' : 'leads';
}

/**
 * Leads | Get leads. Two pages, so each keeps its own link; the current one
 * is marked with aria-current="page".
 */
export function LeadsTabs() {
  const { t } = useTranslation();
  const active = leadsTabFor(useLocation().pathname);
  const tab = (key: 'leads' | 'get', to: string, label: string) => (
    <NavLink
      to={to}
      end
      aria-current={active === key ? 'page' : undefined}
      className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium focus-visible:outline-2 outline-offset-2 ${
        active === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
    </NavLink>
  );
  return (
    <nav aria-label={t('pages.crm.tabs.label')} className="flex gap-1 border-b border-border">
      {tab('leads', '/admin/leads', t('pages.crm.tabs.leads'))}
      {tab('get', '/admin/leads/get', t('pages.crm.tabs.get_leads'))}
    </nav>
  );
}
