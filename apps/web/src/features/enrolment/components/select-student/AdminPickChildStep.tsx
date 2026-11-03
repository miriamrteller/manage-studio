import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useFamilyStudents, partitionFamilyStudents } from '../../hooks/useFamilyStudents';
import type { EnrolmentConstraints } from '../../hooks/useEnrolmentContext';
import { EligibleStudentButton, IneligibleStudentRow } from './StudentChoiceRows';

/** Admin picked a parent in search: choose one of their children, or add a new one. */
export function AdminPickChildStep({
  accountId,
  guardianName,
  constraints,
  onSelectPerson,
  onAddNewChild,
  onBack,
}: {
  accountId: string;
  guardianName: string;
  constraints: EnrolmentConstraints;
  onSelectPerson: (personId: string, dateOfBirth: string | null) => void;
  onAddNewChild: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const familyQuery = useFamilyStudents(accountId, true);
  const { eligible, ineligible } = useMemo(
    () =>
      partitionFamilyStudents(
        familyQuery.data?.students ?? [],
        familyQuery.data?.guardianPersonId ?? null,
        constraints,
      ),
    [familyQuery.data, constraints],
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        {t('pages.enrolment.admin_pick_child_desc', { name: guardianName })}
      </p>

      {familyQuery.isLoading && <p role="status">{t('common.loading')}</p>}
      {familyQuery.error instanceof Error && (
        <p role="alert" className="text-sm text-red-600">
          {familyQuery.error.message}
        </p>
      )}

      {!familyQuery.isLoading && eligible.length === 0 && ineligible.length === 0 && (
        <p className="text-sm text-gray-500">{t('pages.enrolment.admin_no_children')}</p>
      )}

      {!familyQuery.isLoading && (
        <ul className="space-y-2" aria-label={t('pages.enrolment.admin_pick_child_desc', { name: guardianName })}>
          {eligible.map((student) => (
            <li key={student.id}>
              <EligibleStudentButton
                student={student}
                onClick={() => onSelectPerson(student.id, student.date_of_birth ?? null)}
              />
            </li>
          ))}
          {ineligible.map(({ person, reason }) => (
            <li key={person.id}>
              <IneligibleStudentRow name={person.name} reason={reason} />
            </li>
          ))}
        </ul>
      )}

      <Button type="button" variant="outline" className="w-full" onClick={onAddNewChild}>
        {t('pages.enrolment.add_new_child_to_family')}
      </Button>

      <Button type="button" variant="outline" className="w-full" onClick={onBack}>
        {t('common.back')}
      </Button>
    </div>
  );
}
