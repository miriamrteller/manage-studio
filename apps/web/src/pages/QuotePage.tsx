import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PublicQuoteView } from '@/features/quotes/components/public/PublicQuoteView';

/** Public /quote/:token — tenant branding comes from AppLayout (subdomain). */
export default function QuotePage() {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return <p>{t('pages.public_quote.not_found')}</p>;
  return <PublicQuoteView token={token} />;
}
