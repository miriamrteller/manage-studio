import { useTranslation } from 'react-i18next';
import type { Person } from '@shared/schemas';

interface ExpandedStudentRowProps {
  person: Person;
  enrolmentsByPerson: Map<string, string[]>;
  familyMap: Map<string, { contact_person_name: string | null; contact_phone: string | null; contact_email: string | null }>;
  contactPrefsMap: Map<string, { preferred_channel: string; whatsapp_verified: boolean; whatsapp_number: string | null }>;
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
}: ExpandedStudentRowProps) {
  const { t } = useTranslation();
  const family = person.family_id ? familyMap.get(person.family_id) : null;
  const cp = contactPrefsMap.get(person.id);
  const classNames = enrolmentsByPerson.get(person.id) ?? [];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-sm">
      {/* Guardian */}
      <div>
        <p className="font-semibold text-gray-600 mb-1 text-xs uppercase tracking-wide">
          {t('pages.students.guardian_column')}
        </p>
        {family ? (
          <div className="space-y-0.5">
            <p className="font-medium">{family.contact_person_name ?? '—'}</p>
            {family.contact_phone && (
              <p className="text-gray-500">{family.contact_phone}</p>
            )}
            {family.contact_email && (
              <p className="text-gray-500">{family.contact_email}</p>
            )}
          </div>
        ) : (
          <p className="text-gray-400">{t('pages.students.no_guardian')}</p>
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
          <p className="text-gray-400">{t('pages.students.no_classes')}</p>
        )}
      </div>
    </div>
  );
}
