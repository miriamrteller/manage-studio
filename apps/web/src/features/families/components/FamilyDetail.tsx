import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useFamilyDetail } from '../hooks/useFamilyDetail';
import { FamilyService } from '../service';
import { invalidateFamilyCaches } from '../lib/invalidateFamilyCaches';
import { useTenant } from '@/hooks/useTenant';
import { useQueryClient } from '@tanstack/react-query';

interface FamilyDetailProps {
  id: string;
}

/**
 * FamilyDetail: Shows family contact info (editable) and linked people + members.
 * Matches SPEC module 2: "Detail with members, link adult student accounts".
 * No creation or deletion — families are read-only from this view.
 */
export function FamilyDetail({ id }: FamilyDetailProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const tenant = useTenant();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { family, people, members, isLoading, error } = useFamilyDetail(id);

  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  const startEditing = () => {
    setContactName(family?.contact_person_name ?? '');
    setContactEmail(family?.contact_email ?? '');
    setContactPhone(family?.contact_phone ?? '');
    setIsEditing(true);
    setSaveError(null);
  };

  const handleSave = async () => {
    if (!tenant || !family) return;
    try {
      await FamilyService.updateContactWithGuardians(tenant, id, {
        contact_person_name: contactName || undefined,
        contact_email: contactEmail || undefined,
        contact_phone: contactPhone || undefined,
      });
      invalidateFamilyCaches(queryClient, tenant.id, id);
      setIsEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('common.error'));
    }
  };

  if (isLoading) {
    return <div className="p-6 text-center">{t('common.loading')}</div>;
  }

  if (error || !family) {
    return (
      <div className="p-6">
        <p className="text-red-600">{t('errors.not_found')}</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/admin/families')}>
          {t('common.back')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 max-w-3xl mx-auto">
      {/* Back */}
      <Button variant="ghost" size="sm" onClick={() => navigate('/admin/families')}>
        ← {t('common.back')}
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {family.name ?? <span className="italic text-gray-400">{t('pages.families.unnamed')}</span>}
          </h1>
          <p className="text-sm text-gray-500">{t('pages.families.detail_subtitle')}</p>
        </div>
        {!isEditing && (
          <Button variant="secondary" onClick={startEditing}>
            {t('common.edit')}
          </Button>
        )}
      </div>

      {/* Contact info */}
      <section className="card p-4 space-y-4">
        <h2 className="font-semibold text-gray-700">{t('pages.families.contact_section')}</h2>
        {isEditing ? (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">{t('form.family.contact_person_name')}</label>
              <input
                type="text"
                className="form-input w-full"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('form.family.contact_email')}</label>
              <input
                type="email"
                className="form-input w-full"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('form.family.contact_phone')}</label>
              <input
                type="tel"
                className="form-input w-full"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
              />
            </div>
            {saveError && <p className="text-sm text-red-600">{saveError}</p>}
            <div className="flex gap-2">
              <Button variant="primary" onClick={handleSave}>{t('common.save')}</Button>
              <Button variant="outline" onClick={() => setIsEditing(false)}>{t('common.cancel')}</Button>
            </div>
          </div>
        ) : (
          <dl className="space-y-2 text-sm">
            <div className="flex gap-2">
              <dt className="font-medium text-gray-600 w-40">{t('form.family.contact_person_name')}</dt>
              <dd>{family.contact_person_name ?? '—'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-medium text-gray-600 w-40">{t('form.family.contact_email')}</dt>
              <dd>{family.contact_email ?? '—'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-medium text-gray-600 w-40">{t('form.family.contact_phone')}</dt>
              <dd>{family.contact_phone ?? '—'}</dd>
            </div>
          </dl>
        )}
      </section>

      {/* Linked students */}
      <section className="card p-4 space-y-3">
        <h2 className="font-semibold text-gray-700">{t('pages.families.students_section')}</h2>
        {people.length === 0 ? (
          <p className="text-sm text-gray-500">{t('pages.families.no_students')}</p>
        ) : (
          <ul className="divide-y text-sm">
            {people.map((p) => (
              <li key={p.id} className="py-2 flex justify-between items-center">
                <span>{p.name}</span>
                <span className="text-xs text-gray-400">{p.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Guardian / members */}
      <section className="card p-4 space-y-3">
        <h2 className="font-semibold text-gray-700">{t('pages.families.members_section')}</h2>
        {members.length === 0 ? (
          <p className="text-sm text-gray-500">{t('pages.families.no_members')}</p>
        ) : (
          <ul className="divide-y text-sm">
            {members.map((m) => (
              <li key={m.id} className="py-2">
                <div className="flex justify-between">
                  <span className="font-medium">{m.name}</span>
                  <span className="text-xs text-gray-400">{m.role}</span>
                </div>
                {m.email && <div className="text-gray-500">{m.email}</div>}
                {m.phone && <div className="text-gray-500">{m.phone}</div>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Data retention note */}
      <p className="text-xs text-gray-400">{t('pages.families.data_retention_note')}</p>
    </div>
  );
}
