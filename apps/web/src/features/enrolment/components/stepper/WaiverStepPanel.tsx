import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { Engagement } from '@shared/schemas';
import type { useWaiverFlowState } from '../../hooks/useWaiverFlowState';
import type { EnrolmentContextValue } from '../../hooks/useEnrolmentContext';
import { WaiverStep } from '../WaiverStep';
import { WaiverSignedSummary } from '../WaiverSignedSummary';

/** The waiver / health declaration step: already signed, sign now, or loading. */
export function WaiverStepPanel({
  waiverFlow,
  enrolmentData,
  enrolmentContext,
  initialClassId,
  selectedClassName,
  tenantId,
  canGoBack,
  onPrevious,
  onNext,
}: {
  waiverFlow: ReturnType<typeof useWaiverFlowState>;
  enrolmentData: Partial<Engagement>;
  enrolmentContext: EnrolmentContextValue;
  initialClassId?: string;
  selectedClassName: string;
  tenantId?: string;
  canGoBack: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();

  if (waiverFlow.waiverSignedInFlow && waiverFlow.waiverStatus?.template) {
    return (
      <WaiverSignedSummary
        template={waiverFlow.waiverStatus.template}
        signedAt={waiverFlow.waiverSignedAt}
        canGoBack={canGoBack}
        onPrevious={onPrevious}
        onContinue={() => onNext()}
      />
    );
  }

  if (waiverFlow.waiverStatus?.template) {
    return (
      <WaiverStep
        personId={enrolmentData.person_id!}
        template={waiverFlow.waiverStatus.template}
        offeringId={(enrolmentData.offering_id ?? initialClassId)!}
        accountMemberId={enrolmentContext.guardian?.accountMemberId}
        studentName={waiverFlow.waiverPersonDisplay?.name ?? undefined}
        studentDateOfBirth={waiverFlow.waiverPersonDisplay?.date_of_birth ?? null}
        className={selectedClassName || undefined}
        termName={waiverFlow.waiverTermDisplay?.name}
        isMinorStudent={waiverFlow.isMinorStudent}
        signerIsTheStudent={waiverFlow.signerIsTheStudent}
        tenantIdForInvalidation={tenantId}
        onComplete={(evidenceId) => {
          waiverFlow.markWaiverSigned(evidenceId);
          onNext();
        }}
        onPrevious={onPrevious}
        canGoBack={canGoBack}
      />
    );
  }

  return (
    <div className="space-y-4">
      {!waiverFlow.waiverStatus || !waiverFlow.waiverStatus.template ? (
        <p className="text-sm text-muted-foreground" role="status">
          {t('enrolment.waiver_loading', { defaultValue: 'Loading form…' })}
        </p>
      ) : (
        <p className="text-sm text-destructive" role="alert">
          {t('enrolment.waiver_no_template', {
            defaultValue:
              'No active waiver template is set up. Please ask a studio administrator to add a waiver template before enrolling.',
          })}
        </p>
      )}
      <div className="flex justify-between pt-2">
        {canGoBack && (
          <Button variant="outline" onClick={onPrevious}>
            {t('common.back')}
          </Button>
        )}
      </div>
    </div>
  );
}
