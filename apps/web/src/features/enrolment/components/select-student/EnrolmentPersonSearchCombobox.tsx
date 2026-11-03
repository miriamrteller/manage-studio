import { useTranslation } from 'react-i18next';
import { PersonSearchCombobox } from '@/components/shared/PersonSearchCombobox';
import type { PersonSearchResult } from '@/features/people/types';
import type { Person } from '@shared/schemas';
import {
  filterEnrolmentPersonSearchResults,
  isEnrolmentGuardianOnly,
  isEnrolmentPersonSearchSelectable,
} from '../../lib/enrolmentPersonSearch';
import type { EnrolmentConstraints } from '../../hooks/useEnrolmentContext';

interface EnrolmentPersonSearchComboboxProps {
  onSelectPerson: (person: Person, dateOfBirth: string | null) => void;
  onSelectGuardian: (result: PersonSearchResult) => void;
  constraints: EnrolmentConstraints;
  isAdultIntake?: boolean;
  disabled?: boolean;
}

export function EnrolmentPersonSearchCombobox({
  onSelectPerson,
  onSelectGuardian,
  constraints,
  isAdultIntake = false,
  disabled = false,
}: EnrolmentPersonSearchComboboxProps) {
  const { t } = useTranslation();

  return (
    <PersonSearchCombobox
      disabled={disabled}
      label={t('pages.enrolment.admin_search_label')}
      placeholder={t('pages.enrolment.admin_search_placeholder')}
      emptyMessage={t('pages.enrolment.admin_search_empty')}
      filterResults={(results) => filterEnrolmentPersonSearchResults(results, constraints)}
      isSelectable={(result) =>
        isEnrolmentPersonSearchSelectable(result, constraints, isAdultIntake)
      }
      renderResultBadge={(result) =>
        isEnrolmentGuardianOnly(result, isAdultIntake)
          ? t('pages.enrolment.admin_badge_family')
          : t('pages.enrolment.admin_badge_student')
      }
      renderIneligibleHint={(result) => {
        if (isEnrolmentGuardianOnly(result, isAdultIntake)) {
          return t('pages.enrolment.admin_parent_pick_child');
        }
        return constraints.ageBand ? t('pages.enrolment.ineligible_age') : null;
      }}
      renderSubtitle={(result) => {
        if (isEnrolmentGuardianOnly(result, isAdultIntake)) {
          return t('pages.enrolment.admin_parent_row_hint');
        }
        return undefined;
      }}
      onSelect={(person, result) => {
        if (isEnrolmentGuardianOnly(result, isAdultIntake)) {
          onSelectGuardian(result);
          return;
        }
        onSelectPerson(person, person.date_of_birth ?? null);
      }}
    />
  );
}
