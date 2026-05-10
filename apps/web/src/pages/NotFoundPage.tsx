import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { PublicLayout } from '../layouts/PublicLayout';

/**
 * NotFoundPage: 404 error page
 * Shown when route doesn't exist
 * Offers link back to home
 */
export default function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <PublicLayout>
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <h1 className="text-6xl font-bold text-primary mb-4">404</h1>
        <p className="text-2xl font-semibold text-gray-900 mb-4">
          {t('error.not_found')}
        </p>
        <p className="text-lg text-gray-600 mb-8">
          The page you&apos;re looking for doesn&apos;t exist.
        </p>
        <Link
          to="/"
          className="inline-block px-6 py-3 bg-primary text-white rounded hover:bg-opacity-90 focus-visible:outline-2 outline-white outline-offset-2"
        >
          {t('common.home')}
        </Link>
      </div>
    </PublicLayout>
  );
}
