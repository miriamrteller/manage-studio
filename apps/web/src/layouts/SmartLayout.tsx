import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useTenant } from '../hooks/useTenant';
import { ProtectedNavigation } from '../components/Navigation/ProtectedNavigation';
import { PublicNavigation } from '../components/Navigation/PublicNavigation';

export function SmartLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { user, isLoading } = useCurrentUser();
  const tenant = useTenant();

  return (
    <div className="min-h-screen flex flex-col">
      {isLoading ? null : user ? <ProtectedNavigation /> : <PublicNavigation />}

      <main className="flex-1" role="main">{children}</main>

      <footer className="border-t border-border bg-muted mt-16">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h2 className="font-bold mb-2 text-foreground">
                {tenant?.name ?? t('footer.school_name_fallback')}
              </h2>
              <p className="text-sm text-muted-foreground">{t('footer.school_management')}</p>
            </div>
            <div className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} {tenant?.name ?? t('footer.school_name_fallback')}.{' '}
              {t('footer.all_rights')}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
