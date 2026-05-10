import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { supabase } from '../lib/supabase';
import { useTenant } from '../hooks/useTenant';
import { PublicClassSchema } from '@shared/schemas';
import { ClassCard } from '../components/ClassCard';

/**
 * ClassesPage: Public landing page showing available classes
 * - No auth required
 * - Queries public classes from Supabase
 * - Delegates card rendering to ClassCard component
 * - WCAG: Semantic heading, list structure
 */
export function ClassesPage() {
  const { t } = useTranslation();
  const tenant = useTenant();

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
        return z.array(PublicClassSchema).parse(data || []);
      } catch (parseErr) {
        console.error('Invalid class data from Supabase:', parseErr);
        return [];
      }
    },
    enabled: !!tenant?.id,
    staleTime: 5 * 60 * 1000,
  });

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
        <div className="space-y-4" role="list">
          {classes.map((cls) => (
            <div key={cls.id} role="listitem">
              <ClassCard
                class={cls}
                locale={tenant?.locale || 'he-IL'}
                currency={tenant?.currency || 'ILS'}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
