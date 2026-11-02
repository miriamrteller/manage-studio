import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/hooks/useLanguage';
import { OPALSWIFT_BRAND } from '@/lib/theme/opalswiftBrand';
import opalswiftGem from '@/assets/opalswift-gem.png';

export const OPALSWIFT_SITE_URL = 'https://opalswift.com';

/** The OpalSwift gemstone logo (from opalswift.com's footer), 256px source. */
export const OPALSWIFT_GEM_SRC = opalswiftGem;

/** OpalSwift gem + wordmark, linking to the marketing site (tenant-less screens only). */
export function OpalSwiftLogoLink({ className = '' }: { className?: string }) {
  return (
    <a
      href={OPALSWIFT_SITE_URL}
      className={`flex items-center gap-2 text-lg font-bold hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 ${className}`}
      style={{ color: OPALSWIFT_BRAND.ink }}
    >
      <img src={opalswiftGem} alt="" width={24} height={24} className="h-6 w-6" />
      OpalSwift
    </a>
  );
}

/** OpalSwift's own page chrome, for screens that belong to no studio. */
export function OpalSwiftShell({
  children,
  footer,
  headerActions,
  wide = false,
}: {
  children: ReactNode;
  footer?: ReactNode;
  /** Shown at the top right, next to the language toggle (e.g. Logout when signed in). */
  headerActions?: ReactNode;
  /** Left-aligned page content up to 4xl instead of the centred narrow column. */
  wide?: boolean;
}) {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  return (
    <div className="flex min-h-screen flex-col bg-white text-gray-900">
      <div aria-hidden="true" className="h-1" style={{ background: OPALSWIFT_BRAND.gradient }} />
      <header role="banner" className="border-b border-gray-200">
        <div className={`mx-auto flex h-14 items-center justify-between gap-4 px-4 ${wide ? 'max-w-4xl' : 'max-w-3xl'}`}>
          <OpalSwiftLogoLink />
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void setLanguage(language === 'he' ? 'en' : 'he')}
              aria-label={t('common.language')}
            >
              {language === 'he' ? 'English' : 'עברית'}
            </Button>
            {headerActions}
          </div>
        </div>
      </header>
      <main
        role="main"
        className={
          wide
            ? 'mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-10 text-start sm:py-14'
            : 'mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-16 text-center'
        }
      >
        {children}
      </main>
      <footer className="border-t border-gray-200 py-6 text-sm text-gray-700">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 px-4">
          {footer}
          <p>&copy; {new Date().getFullYear()} OpalSwift</p>
        </div>
      </footer>
    </div>
  );
}
