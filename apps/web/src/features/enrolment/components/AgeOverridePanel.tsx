import { useTranslation } from 'react-i18next';
import { enrolmentAgeMismatchMessage } from '@/lib/personAge';

interface AgeOverridePanelProps {
  studentAge: number | null;
  classAges: string | null;
  confirmed: boolean;
  reason: string;
  onConfirmedChange: (confirmed: boolean) => void;
  onReasonChange: (reason: string) => void;
  disabled?: boolean;
  /** When false, only checkbox + reason are rendered (e.g. nested inside an existing alert). */
  showMismatchWarning?: boolean;
}

export function AgeOverridePanel({
  studentAge,
  classAges,
  confirmed,
  reason,
  onConfirmedChange,
  onReasonChange,
  disabled = false,
  showMismatchWarning = true,
}: AgeOverridePanelProps) {
  const { t } = useTranslation();

  if (studentAge == null || !classAges) return null;

  const controls = (
    <>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={disabled}
          onChange={(e) => onConfirmedChange(e.target.checked)}
        />
        {t('pages.enrolment.age_override_label')}
      </label>
      <textarea
        className="w-full rounded border border-amber-300 p-2 text-sm bg-white"
        placeholder={t('pages.enrolment.age_override_reason_placeholder')}
        value={reason}
        maxLength={500}
        disabled={disabled}
        onChange={(e) => onReasonChange(e.target.value)}
      />
    </>
  );

  if (!showMismatchWarning) {
    return <div className="space-y-2">{controls}</div>;
  }

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 space-y-2">
      <p>{enrolmentAgeMismatchMessage(studentAge, classAges, t)}</p>
      {controls}
    </div>
  );
}
