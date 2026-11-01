import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/hooks/useLanguage';

/**
 * Shown on a studio host (subdomain or custom domain) that has no studio.
 * Neutral OpalSwift branding: no studio name, no sign-in or enrol actions.
 */
export default function StudioNotFoundPage({ host }: { host: string }) {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header role="banner" className="border-b border-gray-200">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-4 px-4">
          <span className="text-lg font-bold text-gray-900">OpalSwift</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void setLanguage(language === 'he' ? 'en' : 'he')}
            aria-label={t('common.language')}
          >
            {language === 'he' ? 'English' : 'עברית'}
          </Button>
        </div>
      </header>
      <main role="main" className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-16 text-center">
        <h1 className="mb-4 text-3xl font-bold text-gray-900">{t('studio_not_found.title')}</h1>
        <p className="text-lg text-gray-700">
          {t('studio_not_found.message_before')}
          <bdi dir="ltr" className="font-semibold">{host}</bdi>
          {t('studio_not_found.message_after')}
        </p>
      </main>
      <footer className="border-t border-gray-200 py-6 text-center text-sm text-gray-600">
        &copy; {new Date().getFullYear()} OpalSwift
      </footer>
    </div>
  );
}
