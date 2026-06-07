import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { Person } from '@shared/schemas';

interface ExpandedStudentRowProps {
  person: Person;
  enrolmentsByPerson: Map<string, string[]>;
  familyMap: Map<string, { contact_person_name: string | null; contact_phone: string | null; contact_email: string | null }>;
  contactPrefsMap: Map<string, { preferred_channel: string; whatsapp_verified: boolean; whatsapp_number: string | null }>;
  onEnrol?: (person: Person) => void;
}

/**
 * ExpandedStudentRow: Inline expansion shown below a student row.
 * Shows a quick summary of guardian, notification prefs, and enrolled classes.
 */
export function ExpandedStudentRow({
  person,
  enrolmentsByPerson,
  familyMap,
  contactPrefsMap,
  onEnrol,
}: ExpandedStudentRowProps) {
  const { t } = useTranslation();
  const family = person.account_id ? familyMap.get(person.account_id) : null;
  const cp = contactPrefsMap.get(person.id);
  const classNames = enrolmentsByPerson.get(person.id) ?? [];

  const studentHasContact = !!(
    person.email || person.emergency_contact_name || person.emergency_contact_phone
  );
  const showGuardian = !studentHasContact && !!family;
  const hasContact = studentHasContact || showGuardian;

  const contactLabel = showGuardian
    ? t('pages.students.contact_section_guardian')
    : t('pages.students.contact_section');

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-sm">
      {/* Contact details */}
      <div>
        <p className="font-semibold text-gray-600 mb-1 text-xs uppercase tracking-wide">
          {contactLabel}
        </p>
        {hasContact ? (
          <div className="space-y-0.5">
            {showGuardian && family ? (
              <>
                <p className="font-medium">{family.contact_person_name ?? '—'}</p>
                {family.contact_phone && (
                  <p className="text-gray-500">{family.contact_phone}</p>
                )}
                {family.contact_email && (
                  <p className="text-gray-500">{family.contact_email}</p>
                )}
              </>
            ) : (
              <>
                {person.email && (
                  <p className="text-gray-500">{person.email}</p>
                )}
                {person.emergency_contact_name && (
                  <p className="font-medium">{person.emergency_contact_name}</p>
                )}
                {person.emergency_contact_phone && (
                  <p className="text-gray-500">{person.emergency_contact_phone}</p>
                )}
              </>
            )}
          </div>
        ) : (
          <p className="text-gray-400">{t('pages.students.no_contact')}</p>
        )}
      </div>

      {/* Notifications */}
      <div>
        <p className="font-semibold text-gray-600 mb-1 text-xs uppercase tracking-wide">
          {t('pages.students.notifications_section')}
        </p>
        {cp ? (
          <div className="space-y-0.5">
            <p>
              {cp.preferred_channel === 'whatsapp' ? '💬 WhatsApp' : '✉ Email'}
              {cp.preferred_channel === 'whatsapp' && (
                <span className={`ml-2 text-xs ${cp.whatsapp_verified ? 'text-green-600' : 'text-amber-600'}`}>
                  {cp.whatsapp_verified
                    ? t('pages.students.whatsapp_verified')
                    : t('pages.students.whatsapp_unverified')}
                </span>
              )}
            </p>
            {cp.whatsapp_number && (
              <p className="text-gray-500">{cp.whatsapp_number}</p>
            )}
          </div>
        ) : (
          <p className="text-gray-400">{t('pages.students.no_contact_prefs')}</p>
        )}
      </div>

      {/* Classes */}
      <div>
        <p className="font-semibold text-gray-600 mb-1 text-xs uppercase tracking-wide">
          {t('pages.students.classes_column')}
        </p>
        {classNames.length > 0 ? (
          <ul className="space-y-0.5">
            {classNames.map((cn) => (
              <li key={cn} className="text-gray-700">{cn}</li>
            ))}
          </ul>
        ) : (
          <div className="space-y-2">
            <p className="text-gray-400">{t('pages.students.no_classes')}</p>
            {onEnrol && (
              <Button variant="primary" size="sm" onClick={() => onEnrol(person)}>
                {t('pages.students.enrol_button')}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
