import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { supabase } from '../lib/supabase';
import { useTenant } from '../hooks/useTenant';
import { formatCurrency } from '@shared/format';
import { PublicClassSchema } from '@shared/schemas';
import { getLocale } from '../lib/locale-helper';

/**
 * ClassesPage: Public landing page showing available classes
 * - No auth required
 * - Queries public classes from Supabase
 * - "Enrol Now" button redirects to login
 * - WCAG: Semantic heading, list structure, button labels
 */
export function ClassesPage() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const navigate = useNavigate();

  // Fetch public classes
  const { data: classes = [], isLoading, error } = useQuery({
    queryKey: ['publicClasses', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) {
        console.warn('Tenant not resolved for classes page');
        return [];
      }

      const { data, error: err } = await supabase
        .from('classes')
        .select('id, tenant_id, name, start_time, end_time, price_minor, max_capacity')
        .eq('tenant_id', tenant.id)
        .eq('is_public', true)
        .order('start_time', { ascending: true });

      if (err) {
        console.warn('Failed to fetch classes:', err.message);
        return [];
      }

      // Validate response with Zod
      try {
        const validated = z.array(PublicClassSchema).parse(data || []);
        return validated;
      } catch (parseErr) {
        console.error('Invalid class data from Supabase:', parseErr);
        return [];
      }
    },
    enabled: !!tenant?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const handleEnrolNow = () => {
    navigate('/login', { state: { redirect: '/dashboard/enrol' } });
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-16">
      {/* Hero */}
      <div className="mb-12">
        <h1 className="text-4xl font-bold text-primary mb-4">
          {t('pages.classes.title')}
        </h1>
        <p className="text-lg text-gray-600">
          {t('pages.classes.subtitle')}
        </p>
      </div>

      {/* Classes List */}
      {isLoading ? (
        <div className="text-center py-8">
          <p>{t('common.loading')}</p>
        </div>
      ) : error ? (
        <div
          className="bg-red-50 border border-red-200 rounded p-4 text-red-700"
          role="alert"
        >
          {t('error.fetch_classes')}
        </div>
      ) : classes.length === 0 ? (
        <div className="text-center py-8 text-gray-600">
          {t('pages.classes.no_classes')}
        </div>
      ) : (
        <ul className="space-y-4">
          {classes.map((classItem) => (
            <li
              key={classItem.id}
              className="border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-gray-900">
                    {classItem.name}
                  </h2>
                  <p className="text-sm text-gray-600 mt-1">
                    {classItem.start_time} – {classItem.end_time}
                  </p>
                </div>
                <div className="text-right ms-4">
                  <p className="text-2xl font-bold text-primary">
                    {formatCurrency(classItem.price_minor, 'ILS', getLocale(tenant?.locale))}
                  </p>
                </div>
              </div>

              <div className="flex gap-2 text-sm text-gray-600 mb-4">
                <span>
                  {t('pages.classes.capacity')}: {classItem.max_capacity}
                </span>
              </div>

              <button
                onClick={handleEnrolNow}
                className="px-6 py-2 bg-primary text-white rounded hover:bg-opacity-90 focus-visible:outline-2 outline-white outline-offset-2"
                aria-label={`${t('pages.classes.enrol_now')} - ${classItem.name}`}
              >
                {t('pages.classes.enrol_now')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
