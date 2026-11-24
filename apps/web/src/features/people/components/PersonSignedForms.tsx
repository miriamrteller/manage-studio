import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';

interface SignedFormRow {
  id: string;
  signed_at: string;
  offerings: { name: string | null } | null;
}

function formatSignedDate(iso: string, language: string): string {
  try {
    return new Date(iso).toLocaleDateString(language === 'he' ? 'he-IL' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Jerusalem',
    });
  } catch {
    return iso;
  }
}

/** The forms (waiver, health declaration, contract) a person has signed, newest first. */
export function PersonSignedForms({ personId }: { personId: string }) {
  const { t, i18n } = useTranslation();
  const tenant = useTenant();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['person-signed-forms', tenant?.id, personId],
    queryFn: async (): Promise<SignedFormRow[]> => {
      const { data, error } = await supabase
        .from('waiver_evidence')
        .select('id, signed_at, offerings!offering_id(name)')
        .eq('tenant_id', tenant!.id)
        .eq('person_id', personId)
        .order('signed_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SignedFormRow[];
    },
    enabled: !!tenant?.id,
  });

  return (
    <section className="space-y-2">
      <h3 className="font-semibold text-gray-700">{t('pages.people.signed_forms')}</h3>
      {isLoading ? (
        <p className="text-sm text-gray-400">{t('common.loading')}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-400">{t('pages.people.no_signed_forms')}</p>
      ) : (
        <ul className="divide-y text-sm">
          {rows.map((row) => (
            <li key={row.id} className="flex justify-between gap-2 py-1.5">
              <span>{row.offerings?.name ?? '—'}</span>
              <span className="text-gray-500">
                {t('pages.people.signed_on', { date: formatSignedDate(row.signed_at, i18n.language) })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
