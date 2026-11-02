import { type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { parseNamedForm } from '@shared/index';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';
import { InquiryForm } from '@/features/crm/components/InquiryForm';

/**
 * /f/<slug> (with the app header) and /embed/f/<slug> (iframe): a studio's
 * named enquiry form. Closed forms say so and link to the general form.
 */
export default function NamedFormPage({ embedded = false }: { embedded?: boolean }) {
  const { slug = '' } = useParams();
  const { t } = useTranslation();
  const tenant = useTenant();
  const query = useQuery({
    queryKey: ['named-form-public', tenant?.id, slug],
    enabled: Boolean(tenant?.id && slug),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_named_lead_form', { p_tenant_id: tenant!.id, p_slug: slug });
      if (error) throw new Error(error.message);
      return parseNamedForm(data);
    },
  });

  const general = embedded ? '/embed/inquire' : '/inquire';
  const notice = (title: string, message: string): ReactNode => (
    <div className={embedded ? 'p-4 text-center space-y-3' : 'max-w-lg mx-auto py-12 px-4 text-center space-y-3'}>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p>{message}</p>
      <p>
        <Link to={general} className="underline">
          {t('pages.crm.named_form.general_link')}
        </Link>
      </p>
    </div>
  );

  if (!tenant || query.isLoading) {
    return (
      <p role="status" className="p-4">
        {t('common.loading')}
      </p>
    );
  }
  const form = query.data;
  if (query.isError || !form) return notice(t('pages.crm.named_form.not_found_title'), t('pages.crm.named_form.not_found'));
  if (form.status === 'closed') return notice(t('pages.crm.named_form.closed_title'), t('pages.crm.named_form.closed'));
  return <InquiryForm embedded={embedded} namedForm={form} />;
}
