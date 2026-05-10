import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { PublicLayout } from '../layouts/PublicLayout';

/**
 * SignupPage: Placeholder for Phase 1B
 * Full signup wizard implemented in Phase 1C
 * For now, directs users to enrolment and login
 */
export default function SignupPage() {
  const { t } = useTranslation();

  return (
    <PublicLayout>
      <div className="max-w-2xl mx-auto px-4 py-16">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-8">
          <h1 className="text-3xl font-bold text-primary mb-4">
            {t('pages.login.signup')}
          </h1>
          <p className="text-lg text-gray-600 mb-6">
            Complete signup wizard coming in Phase 1C. For now, enrol directly
            from the classes page.
          </p>
          <div className="space-y-4">
            <div>
              <p className="font-semibold text-gray-900 mb-2">
                New to our school?
              </p>
              <p className="text-gray-600 mb-4">
                Browse our classes and enrol directly.
              </p>
              <Link
                to="/classes"
                className="inline-block px-6 py-3 bg-primary text-white rounded hover:bg-opacity-90 focus-visible:outline-2 outline-white outline-offset-2"
              >
                {t('nav.classes')}
              </Link>
            </div>
            <div className="pt-4 border-t border-blue-200">
              <p className="font-semibold text-gray-900 mb-2">
                Already have an account?
              </p>
              <Link
                to="/login"
                className="text-primary font-semibold hover:underline focus-visible:outline-2 outline-primary outline-offset-2"
              >
                {t('pages.login.title')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
