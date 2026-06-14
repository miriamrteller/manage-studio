import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { AuthenticatedCompletionView } from '@/features/enrolment/components/AuthenticatedCompletionView';
import { TokenCompletionView } from '@/features/enrolment/components/TokenCompletionView';
import { getEnrolmentTokenFromSearchParams } from '@/features/enrolment/lib/enrolmentToken';

/**
 * EnrolPayPage: Complete waiver and payment for a pending enrolment (e.g. from admin-sent link).
 * Routes token-link visitors to TokenCompletionView; authenticated users to AuthenticatedCompletionView.
 */
export default function EnrolPayPage() {
  const { engagementId } = useParams<{ engagementId: string }>();
  const [searchParams] = useSearchParams();
  const [waiverToken, setWaiverToken] = useState<string | null>(() =>
    getEnrolmentTokenFromSearchParams(searchParams),
  );

  const tokenInUrl = searchParams.get('t');
  const effectiveToken = waiverToken ?? tokenInUrl;

  useEffect(() => {
    if (tokenInUrl && !waiverToken) {
      setWaiverToken(tokenInUrl);
    }
  }, [tokenInUrl, waiverToken]);

  if (effectiveToken && engagementId) {
    return <TokenCompletionView engagementId={engagementId} effectiveToken={effectiveToken} />;
  }

  return <AuthenticatedCompletionView engagementId={engagementId} />;
}
