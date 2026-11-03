import { useTranslation } from 'react-i18next';
import { formatEnrolmentStudentAgeLine } from '@/lib/personAge';

interface ChoosableStudent {
  name: string;
  date_of_birth?: string | null;
  activeClassNames: string[];
}

/** A student that can be picked: name plus age and current classes. */
export function EligibleStudentButton({
  student,
  onClick,
}: {
  student: ChoosableStudent;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-lg border-2 border-blue-600 p-4 text-start hover:bg-blue-50 transition"
    >
      <span className="block font-medium">{student.name}</span>
      <span className="block text-sm text-gray-600">
        {[
          formatEnrolmentStudentAgeLine(student.date_of_birth, t),
          student.activeClassNames.length > 0
            ? t('pages.enrolment.enrolled_in', { classes: student.activeClassNames.join(', ') })
            : t('pages.enrolment.no_current_enrolments'),
        ]
          .filter(Boolean)
          .join(' · ')}
      </span>
    </button>
  );
}

/** A student that can't be picked for this class, with the reason. */
export function IneligibleStudentRow({
  name,
  reason,
}: {
  name: string;
  reason: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="w-full rounded-lg border border-gray-200 p-4 opacity-60">
      <span className="block font-medium">{name}</span>
      <span className="block text-xs text-amber-700">
        {reason === 'age'
          ? t('pages.enrolment.ineligible_age')
          : t('pages.enrolment.ineligible_account')}
      </span>
    </div>
  );
}
