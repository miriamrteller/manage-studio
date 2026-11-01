import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { EnrolmentTermsCheckbox } from '@/components/legal/EnrolmentTermsCheckbox';
import { acceptEnrolmentTerms } from '../lib/enrolmentTermsService';

export interface EnrolmentTermsGateProps {
  engagementId: string;
  enrolmentToken?: string;
  termsUrl: string | null;
  privacyUrl: string | null;
  onAccepted: () => void;
  onPrevious?: () => void;
}

/**
 * Shown before payment when the studio requires its enrolment terms. The box is unticked
 * by default; "Continue" records the acceptance server-side, then payment is shown.
 */
export function EnrolmentTermsGate({
  engagementId,
  enrolmentToken,
  termsUrl,
  privacyUrl,
  onAccepted,
  onPrevious,
}: EnrolmentTermsGateProps) {
  const { t } = useTranslation();
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleContinue = async () => {
    if (!checked) {
      setError(t('legal.terms_required'));
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await acceptEnrolmentTerms({ engagementId, enrolmentToken });
      onAccepted();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="enrolment-terms-gate">
      <p className="text-sm text-muted-foreground">{t('legal.terms_gate_intro')}</p>
      <EnrolmentTermsCheckbox
        checked={checked}
        onChange={(value) => {
          setChecked(value);
          if (value) setError(null);
        }}
        termsUrl={termsUrl}
        privacyUrl={privacyUrl}
        disabled={isSubmitting}
      />
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="primary"
          className="w-full"
          disabled={isSubmitting}
          isLoading={isSubmitting}
          onClick={() => void handleContinue()}
        >
          {t('legal.terms_continue')}
        </Button>
        {onPrevious && (
          <Button type="button" variant="outline" className="w-full" disabled={isSubmitting} onClick={onPrevious}>
            {t('common.back')}
          </Button>
        )}
      </div>
    </div>
  );
}
