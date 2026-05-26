import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { PersonForm } from '@/features/people/components/PersonForm';
import { PersonService } from '@/features/people/service';
import { FamilyService } from '@/features/families/service';
import { refreshFamilyCaches } from '@/features/families/lib/invalidateFamilyCaches';
import { useTenant } from '@/hooks/useTenant';
import { useQueryClient } from '@tanstack/react-query';
import { useStudentDetail } from '../hooks/useStudentDetail';
import { AdminEnrolStudentModal } from '@/features/enrolment/components/AdminEnrolStudentModal';
import { resolveGuardianEmail } from '@/features/enrolment/lib/resolveGuardianEmail';
import { formatDate, calculateAge } from '@/lib/utils';

interface StudentSlideOverProps {
  personId: string;
  onClose: () => void;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  active: { bg: 'var(--color-success-light)', text: 'var(--color-success)' },
  pending_payment: { bg: 'var(--color-warning-light)', text: 'var(--color-warning)' },
  waitlisted: { bg: 'var(--color-info-light)', text: 'var(--color-info)' },
  cancelled: { bg: 'var(--color-neutral-100)', text: 'var(--color-text-secondary)' },
  withdrawn: { bg: 'var(--color-neutral-100)', text: 'var(--color-text-secondary)' },
};

/**
 * StudentSlideOver: Full detail panel sliding in from the right.
 * Shows student info, enrolments, guardian/family, notification preferences,
 * and billing accounts found via enrolments.
 */
export function StudentSlideOver({ personId, onClose }: StudentSlideOverProps) {
  const { t } = useTranslation();
  const tenant = useTenant();
  const queryClient = useQueryClient();

  const { person, family, members, contactPrefs, enrolments, isLoading, error } =
    useStudentDetail(personId);

  const [isEditingPerson, setIsEditingPerson] = useState(false);
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactSaveError, setContactSaveError] = useState<string | null>(null);
  const [contactSaving, setContactSaving] = useState(false);
  const [enrolModalOpen, setEnrolModalOpen] = useState(false);

  const startEditContact = () => {
    setContactName(family?.contact_person_name ?? '');
    setContactEmail(family?.contact_email ?? '');
    setContactPhone(family?.contact_phone ?? '');
    setContactSaveError(null);
    setIsEditingContact(true);
  };

  const saveContact = async () => {
    if (!tenant || !family) return;
    setContactSaving(true);
    setContactSaveError(null);
    try {
      const { family: updatedFamily, members: updatedMembers } =
        await FamilyService.updateContactWithGuardians(tenant, family.id, {
          contact_person_name: contactName || undefined,
          contact_email: contactEmail || undefined,
          contact_phone: contactPhone || undefined,
        });
      await refreshFamilyCaches(queryClient, tenant.id, updatedFamily, updatedMembers);
      setIsEditingContact(false);
    } catch (err) {
      setContactSaveError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setContactSaving(false);
    }
  };

  // Collect unique billing accounts from enrolments
  const billingAccountsMap = new Map(
    enrolments
      .filter((e) => e.billingAccount)
      .map((e) => [e.billingAccount!.id, e.billingAccount!])
  );
  const billingAccounts = [...billingAccountsMap.values()];

  const age = person?.date_of_birth ? calculateAge(person.date_of_birth) : undefined;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-40 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className="fixed top-0 right-0 h-full w-full max-w-xl bg-white shadow-2xl z-50 flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label={person?.name ?? t('pages.students.title')}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold">{person?.name ?? '...'}</h2>
            {age !== undefined && (
              <p className="text-sm text-gray-500">
                {t('pages.people.age_label')}: {age}
                {person?.date_of_birth && ` (${formatDate(person.date_of_birth)})`}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            aria-label={t('common.close')}
          >
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {isLoading && <p className="text-center py-8 text-gray-500">{t('common.loading')}</p>}
          {error && <p className="text-red-600">{t('errors.server_error')}</p>}

          {person && !isLoading && (
            <>
              {/* ── 1. Student info ── */}
              <section className="space-y-3">
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold text-gray-700">{t('pages.people.detail_title')}</h3>
                  {!isEditingPerson && (
                    <Button variant="ghost" size="sm" onClick={() => setIsEditingPerson(true)}>
                      {t('common.edit')}
                    </Button>
                  )}
                </div>

                {isEditingPerson ? (
                  <PersonForm
                    person={person}
                    onSubmit={async (data) => {
                      if (!tenant) throw new Error('Tenant not initialized');
                      await PersonService.update(tenant, person.id, data);
                      await queryClient.invalidateQueries({
                        queryKey: ['student-detail-person', tenant.id, personId],
                      });
                      await queryClient.invalidateQueries({ queryKey: ['students', tenant.id] });
                      setIsEditingPerson(false);
                    }}
                  />
                ) : (
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div>
                      <dt className="text-gray-500">{t('common.status')}</dt>
                      <dd>
                        <span
                          className="px-2 py-0.5 rounded text-xs font-medium"
                          style={{
                            backgroundColor:
                              person.status === 'active'
                                ? 'var(--color-success-light)'
                                : 'var(--color-neutral-100)',
                            color:
                              person.status === 'active'
                                ? 'var(--color-success)'
                                : 'var(--color-text-secondary)',
                          }}
                        >
                          {t(`pages.people.status_${person.status}`)}
                        </span>
                      </dd>
                    </div>
                    {person.email && (
                      <div>
                        <dt className="text-gray-500">{t('pages.people.email_label')}</dt>
                        <dd>{person.email}</dd>
                      </div>
                    )}
                    {person.emergency_contact_name && (
                      <div className="col-span-2">
                        <dt className="text-gray-500">
                          {t('pages.people.emergency_contact_name_label')}
                        </dt>
                        <dd>
                          {person.emergency_contact_name}
                          {person.emergency_contact_phone &&
                            ` · ${person.emergency_contact_phone}`}
                        </dd>
                      </div>
                    )}
                  </dl>
                )}
              </section>

              <hr style={{ borderColor: 'var(--color-border-default)' }} />

              {/* ── 2. Enrolments ── */}
              <section className="space-y-2">
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold text-gray-700">{t('pages.students.enrolments_section')}</h3>
                  <Button variant="primary" size="sm" onClick={() => setEnrolModalOpen(true)}>
                    {t('pages.students.enrol_button')}
                  </Button>
                </div>
                {enrolments.length === 0 ? (
                  <p className="text-sm text-gray-400">{t('pages.students.no_enrolments')}</p>
                ) : (
                  <ul className="divide-y text-sm" style={{ borderColor: 'var(--color-border-default)' }}>
                    {enrolments.map((e) => {
                      const colors = STATUS_COLORS[e.status] ?? STATUS_COLORS.cancelled;
                      return (
                        <li key={e.id} className="py-2 flex justify-between items-center gap-3">
                          <span className="font-medium">{e.className ?? e.class_id}</span>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span
                              className="px-2 py-0.5 rounded text-xs font-medium"
                              style={{ backgroundColor: colors.bg, color: colors.text }}
                            >
                              {e.status.replace('_', ' ')}
                            </span>
                            {e.billingAccount && (
                              <span className="text-xs text-gray-500">
                                {e.billingAccount.payment_method}
                              </span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <hr style={{ borderColor: 'var(--color-border-default)' }} />

              {/* ── 3. Guardian / Family ── */}
              <section className="space-y-2">
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold text-gray-700">
                    {t('pages.students.contact_section_guardian')}
                  </h3>
                  {family && !isEditingContact && (
                    <Button variant="ghost" size="sm" onClick={startEditContact}>
                      {t('common.edit')}
                    </Button>
                  )}
                </div>

                {!family && (
                  <p className="text-sm text-gray-400">{t('pages.students.no_family')}</p>
                )}

                {family && !isEditingContact && (
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div>
                      <dt className="text-gray-500">{t('form.family.contact_person_name')}</dt>
                      <dd>{family.contact_person_name ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">{t('form.family.contact_phone')}</dt>
                      <dd>{family.contact_phone ?? '—'}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-gray-500">{t('form.family.contact_email')}</dt>
                      <dd>{family.contact_email ?? '—'}</dd>
                    </div>
                  </dl>
                )}

                {family && isEditingContact && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        {t('form.family.contact_person_name')}
                      </label>
                      <input
                        type="text"
                        className="form-input w-full"
                        value={contactName}
                        onChange={(e) => setContactName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        {t('form.family.contact_email')}
                      </label>
                      <input
                        type="email"
                        className="form-input w-full"
                        value={contactEmail}
                        onChange={(e) => setContactEmail(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        {t('form.family.contact_phone')}
                      </label>
                      <input
                        type="tel"
                        className="form-input w-full"
                        value={contactPhone}
                        onChange={(e) => setContactPhone(e.target.value)}
                      />
                    </div>
                    {contactSaveError && (
                      <p className="text-sm text-red-600">{contactSaveError}</p>
                    )}
                    <div className="flex gap-2">
                      <Button variant="primary" onClick={saveContact} disabled={contactSaving}>
                        {contactSaving ? t('common.loading') : t('common.save')}
                      </Button>
                      <Button variant="outline" onClick={() => setIsEditingContact(false)}>
                        {t('common.cancel')}
                      </Button>
                    </div>
                  </div>
                )}

                {members.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                      {t('pages.families.members_section')}
                    </p>
                    <ul className="divide-y text-sm">
                      {members.map((m) => (
                        <li key={m.id} className="py-1.5 flex justify-between">
                          <span>{m.name}</span>
                          <span className="text-xs text-gray-400">{m.role}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>

              <hr style={{ borderColor: 'var(--color-border-default)' }} />

              {/* ── 4. Notification preferences ── */}
              <section className="space-y-2">
                <h3 className="font-semibold text-gray-700">{t('pages.students.notifications_section')}</h3>
                {!contactPrefs ? (
                  <p className="text-sm text-gray-400">{t('pages.students.no_contact_prefs')}</p>
                ) : (
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div>
                      <dt className="text-gray-500">{t('pages.students.preferred_channel')}</dt>
                      <dd className="capitalize">{contactPrefs.preferred_channel}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">Email</dt>
                      <dd>
                        {contactPrefs.email_opted_in
                          ? t('pages.students.opted_in')
                          : t('pages.students.opted_out')}
                      </dd>
                    </div>
                    {contactPrefs.preferred_channel === 'whatsapp' && (
                      <>
                        <div>
                          <dt className="text-gray-500">WhatsApp</dt>
                          <dd>{contactPrefs.whatsapp_number ?? '—'}</dd>
                        </div>
                        <div>
                          <dt className="text-gray-500">{t('pages.students.whatsapp_status')}</dt>
                          <dd
                            className={
                              contactPrefs.whatsapp_verified ? 'text-green-600' : 'text-amber-600'
                            }
                          >
                            {contactPrefs.whatsapp_verified
                              ? t('pages.students.whatsapp_verified')
                              : t('pages.students.whatsapp_unverified')}
                          </dd>
                        </div>
                      </>
                    )}
                  </dl>
                )}
              </section>

              <hr style={{ borderColor: 'var(--color-border-default)' }} />

              {/* ── 5. Billing ── */}
              <section className="space-y-2">
                <h3 className="font-semibold text-gray-700">{t('pages.students.billing_section')}</h3>
                {billingAccounts.length === 0 ? (
                  <p className="text-sm text-gray-400">{t('pages.students.no_billing')}</p>
                ) : (
                  <ul className="divide-y text-sm">
                    {billingAccounts.map((ba) => (
                      <li key={ba.id} className="py-2 space-y-1">
                        <p className="font-medium">{ba.account_holder_name}</p>
                        <p className="text-gray-500">{ba.primary_contact_email}</p>
                        <div className="flex gap-3 text-xs text-gray-500">
                          <span className="capitalize">{ba.payment_method.replace('_', ' ')}</span>
                          <span
                            className={ba.status === 'active' ? 'text-green-600' : 'text-gray-400'}
                          >
                            {ba.status}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-gray-400 italic">
                  {t('pages.students.payment_history_placeholder')}
                </p>
              </section>
            </>
          )}
        </div>
      </div>

      {person && (
        <AdminEnrolStudentModal
          isOpen={enrolModalOpen}
          personId={personId}
          personName={person.name}
          personDateOfBirth={person.date_of_birth}
          familyId={person.family_id}
          guardianEmail={resolveGuardianEmail({ person, family: family ?? undefined, members })}
          guardianName={family?.contact_person_name ?? null}
          onClose={() => setEnrolModalOpen(false)}
          onSuccess={() => {
            void queryClient.invalidateQueries({
              queryKey: ['student-detail-enrolments', tenant?.id, personId],
            });
            void queryClient.invalidateQueries({ queryKey: ['students-list-enrolments', tenant?.id] });
          }}
        />
      )}
    </>
  );
}
