import fs from 'fs';

const p =
  'apps/web/src/features/enrolment/components/EnrolmentStepper.tsx';
const text = fs.readFileSync(p, 'utf8');
const start = text.indexOf('function StepCheckout({');
const end = text.indexOf('/**\r\n * Step 5:', start);
if (start < 0) throw new Error('start not found');
const endAlt = text.indexOf('/**\n * Step 5:', start);
const endIdx = end >= 0 ? end : endAlt;
if (endIdx < 0) throw new Error('end not found');

const replacement = `function StepCheckout({
  enrolmentData,
  checkoutEnrolmentId,
  checkoutError,
  isPreparing,
  onPaymentSuccess,
  onPrevious,
}: {
  enrolmentData: Partial<Enrolment>;
  checkoutEnrolmentId: string | null;
  checkoutError: string | null;
  isPreparing: boolean;
  onPaymentSuccess: () => void;
  onPrevious: () => void;
}) {
  const { t } = useTranslation();

  if (!enrolmentData.class_id || !enrolmentData.term_id) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {t('enrolment.missing_class_or_term')}
      </p>
    );
  }

  if (checkoutError) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {checkoutError}
      </p>
    );
  }

  if (isPreparing || !checkoutEnrolmentId) {
    return <p role="status">{t('common.loading')}</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('enrolment.checkout_desc')}</p>
      <EnrolmentPaymentForm
        classId={enrolmentData.class_id}
        enrolmentId={checkoutEnrolmentId}
        onPaid={onPaymentSuccess}
        onPrevious={onPrevious}
      />
    </div>
  );
}

`;

fs.writeFileSync(p, text.slice(0, start) + replacement + text.slice(endIdx));
console.log('patched StepCheckout');
