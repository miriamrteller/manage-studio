import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { ConsentTemplate } from '@shared/schemas';

interface WaiverSignedSummaryProps {
  template: ConsentTemplate;
  signedAt: string | null;
  canGoBack: boolean;
  onPrevious: () => void;
  onContinue: () => void;
}

export function WaiverSignedSummary({
  template,
  signedAt,
  canGoBack,
  onPrevious,
  onContinue,
}: WaiverSignedSummaryProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-4 py-3">
        <svg
          className="h-5 w-5 shrink-0 text-green-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        <div>
          <p className="text-sm font-medium text-green-800">
            {t('enrolment.waiver_already_signed', { defaultValue: 'Waiver signed' })}
          </p>
          {signedAt && (
            <p className="text-xs text-green-700">{new Date(signedAt).toLocaleString()}</p>
          )}
        </div>
      </div>

      <div
        role="region"
        aria-label={t('enrolment.waiver_document_region', { defaultValue: 'Waiver document' })}
        className="h-72 overflow-y-auto rounded-md border border-border bg-muted/30 p-4 text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground"
      >
        {template.content}
      </div>

      <div className="flex justify-between pt-2">
        {canGoBack && (
          <Button variant="outline" onClick={onPrevious}>
            {t('common.back')}
          </Button>
        )}
        <Button className="ml-auto" onClick={onContinue}>
          {t('enrolment.waiver_continue_to_payment', { defaultValue: 'Continue to Payment' })}
        </Button>
      </div>
    </div>
  );
}
