import { useParams, useSearchParams } from 'react-router-dom';
import { PublicPayRequest } from '@/features/jobs/components/PublicPayRequest';

/**
 * PayRequestPage: public pay link for a job (shoot) deposit/balance request.
 * No session — the token in the URL is the capability (see
 * job-payment-request-public). Hosted-page return lands here with ?result=.
 */
export default function PayRequestPage() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  if (!token) return null;
  return <PublicPayRequest token={token} result={searchParams.get('result')} />;
}
