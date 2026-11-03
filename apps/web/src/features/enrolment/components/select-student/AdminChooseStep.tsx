import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { PersonSearchResult } from '@/features/people/types';
import type { EnrolmentConstraints } from '../../hooks/useEnrolmentContext';
import { EnrolmentPersonSearchCombobox } from './EnrolmentPersonSearchCombobox';

/** Admin's first screen: search for someone, or start a new family / adult. */
export function AdminChooseStep({
  constraints,
  isAdultIntake,
  onSelectPerson,
  onSelectGuardian,
  onNewFamily,
  onNewAdult,
  onCancel,
}: {
  constraints: EnrolmentConstraints;
  isAdultIntake: boolean;
  onSelectPerson: (personId: string, dateOfBirth: string | null) => void;
  onSelectGuardian: (result: PersonSearchResult) => void;
  onNewFamily: () => void;
  onNewAdult: () => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">{t('pages.enrolment.admin_select_desc')}</p>
      <EnrolmentPersonSearchCombobox
        constraints={constraints}
        isAdultIntake={isAdultIntake}
        onSelectPerson={(person, dob) => onSelectPerson(person.id, dob)}
        onSelectGuardian={onSelectGuardian}
      />
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={onNewFamily}
      >
        {t('pages.enrolment.add_child_to_family')}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={onNewAdult}
      >
        {isAdultIntake
          ? t('pages.enrolment.create_new_adult')
          : t('pages.enrolment.person_new_adult')}
      </Button>
      <Button type="button" variant="ghost" className="w-full" onClick={onCancel}>
        {t('common.cancel')}
      </Button>
    </div>
  );
}
