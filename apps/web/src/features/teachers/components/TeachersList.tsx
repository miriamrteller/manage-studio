import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Staff } from '@shared/schemas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { EmptyState } from '@/components/shared';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';
import { useTeachers } from '../hooks/useTeachers';

type TeacherStatus = 'linked' | 'waiting' | 'no_email';

export function teacherStatus(teacher: Pick<Staff, 'email' | 'user_profile_id'>): TeacherStatus {
  if (teacher.user_profile_id) return 'linked';
  return teacher.email ? 'waiting' : 'no_email';
}

/** The studio's sign-in page, where a teacher signs in with their email code. */
export function teacherSignInUrl(origin: string = window.location.origin): string {
  return `${origin}/login`;
}

/** "Teachers see only their own classes" (tenants.teachers_own_classes_only, off by default). */
function OwnClassesOnlySetting() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);

  const { data: ownOnly, isLoading } = useQuery({
    queryKey: ['tenant-teachers-own-classes-only', tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('teachers_own_classes_only')
        .eq('id', tenant!.id)
        .maybeSingle();
      if (error) throw error;
      return data?.teachers_own_classes_only === true;
    },
  });

  const save = useMutation({
    mutationFn: async (next: boolean) => {
      const { error } = await supabase
        .from('tenants')
        .update({ teachers_own_classes_only: next })
        .eq('id', tenant!.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      setMessage(t('teachers.saved'));
      await queryClient.invalidateQueries({ queryKey: ['tenant-teachers-own-classes-only'] });
    },
    onError: () => setMessage(t('teachers.error')),
  });

  if (!tenant) return null;

  return (
    <section className="card space-y-1" aria-label={t('teachers.own_only_label')}>
      <label className="flex items-start gap-2 text-sm font-medium">
        <input
          type="checkbox"
          className="mt-1"
          checked={ownOnly === true}
          disabled={isLoading || save.isPending}
          onChange={(e) => save.mutate(e.target.checked)}
          aria-describedby="teachers-own-only-help"
          data-testid="teachers-own-classes-only"
        />
        <span>{t('teachers.own_only_label')}</span>
      </label>
      <p id="teachers-own-only-help" className="text-xs text-gray-600">
        {t('teachers.own_only_help')}
      </p>
      {message && (
        <p className="text-sm" role="status">
          {message}
        </p>
      )}
    </section>
  );
}

interface TeacherFormValues {
  name: string;
  email: string;
  phone: string;
}

function TeacherForm({
  teacher,
  onSubmit,
  onCancel,
  isSaving,
  error,
}: {
  teacher?: Staff;
  onSubmit: (values: TeacherFormValues) => void;
  onCancel: () => void;
  isSaving: boolean;
  error: string | null;
}) {
  const { t } = useTranslation();
  const [values, setValues] = useState<TeacherFormValues>({
    name: teacher?.name ?? '',
    email: teacher?.email ?? '',
    phone: teacher?.phone ?? '',
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!values.name.trim()) return;
    onSubmit(values);
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate={false}>
      {error && (
        <div className="alert-error" role="alert">
          {error}
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor="teacher-name">{t('teachers.name')}</Label>
        <Input
          id="teacher-name"
          required
          value={values.name}
          onChange={(e) => setValues({ ...values, name: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="teacher-email">{t('teachers.email')}</Label>
        <Input
          id="teacher-email"
          type="email"
          dir="ltr"
          value={values.email}
          aria-describedby="teacher-email-help"
          onChange={(e) => setValues({ ...values, email: e.target.value })}
        />
        <p id="teacher-email-help" className="text-xs text-gray-600">
          {t('teachers.email_help')}
        </p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="teacher-phone">{t('teachers.phone')}</Label>
        <Input
          id="teacher-phone"
          type="tel"
          dir="ltr"
          value={values.phone}
          onChange={(e) => setValues({ ...values, phone: e.target.value })}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={isSaving || !values.name.trim()}>
          {isSaving ? t('common.loading') : t('teachers.save')}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
          {t('teachers.cancel')}
        </Button>
      </div>
    </form>
  );
}

/** After a teacher with an email is saved: the link to send them, ready to copy or share. */
function SignInShare({ teacher }: { teacher: Staff }) {
  const { t } = useTranslation();
  const tenant = useTenant();
  const [copied, setCopied] = useState(false);
  const url = teacherSignInUrl();
  const message = t('teachers.whatsapp_message', {
    name: teacher.name,
    studio: tenant?.name ?? '',
    url,
    email: teacher.email ?? '',
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm">{t('teachers.share_text', { email: teacher.email })}</p>
      <p className="rounded border bg-gray-50 p-2 text-sm" dir="ltr">
        {url}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={copy}>
          {t('teachers.copy_link')}
        </Button>
        <a
          className="btn btn-outline inline-flex items-center rounded border px-3 py-2 text-sm"
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('teachers.whatsapp')}
        </a>
      </div>
      {copied && (
        <p className="text-sm" role="status">
          {t('teachers.copied')}
        </p>
      )}
    </div>
  );
}

/** Admin → Teachers: add, edit and remove teachers, see who has signed in, and the class setting. */
export function TeachersList() {
  const { t } = useTranslation();
  const data = useTeachers({ page: 1 });
  const [editing, setEditing] = useState<Staff | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [sharing, setSharing] = useState<Staff | null>(null);
  const [removing, setRemoving] = useState<Staff | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const closeForm = () => {
    setIsAdding(false);
    setEditing(null);
    setFormError(null);
  };

  const save = (values: TeacherFormValues) => {
    setFormError(null);
    const onError = () => setFormError(t('teachers.error'));
    if (editing) {
      const emailChanged = (editing.email ?? '') !== values.email.trim();
      data.updateTeacher(
        { ...editing, ...values },
        {
          onSuccess: (saved) => {
            closeForm();
            if (emailChanged && saved.email) setSharing(saved);
          },
          onError,
        },
      );
    } else {
      data.createTeacher(values, {
        onSuccess: (saved) => {
          closeForm();
          if (saved.email) setSharing(saved);
        },
        onError,
      });
    }
  };

  const statusLabel: Record<TeacherStatus, string> = {
    linked: t('teachers.status_linked'),
    waiting: t('teachers.status_waiting'),
    no_email: t('teachers.status_no_email'),
  };

  return (
    <div className="space-y-4 p-4">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">{t('teachers.title')}</h1>
        <p className="text-gray-600">{t('teachers.description')}</p>
      </div>

      <OwnClassesOnlySetting />

      <div className="flex justify-end">
        <Button variant="primary" onClick={() => setIsAdding(true)}>
          {t('teachers.add')}
        </Button>
      </div>

      {data.isLoading && <div className="py-4 text-center">{t('common.loading')}</div>}

      {!data.isLoading && data.teachers.length === 0 && (
        <EmptyState
          title={t('teachers.empty_title')}
          message={t('teachers.empty_message')}
          actionLabel={t('teachers.add')}
          onAction={() => setIsAdding(true)}
        />
      )}

      {data.teachers.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b" style={{ borderColor: 'var(--color-border-default)' }}>
              <tr>
                <th className="px-4 py-3 text-start font-medium">{t('teachers.name')}</th>
                <th className="px-4 py-3 text-start font-medium">{t('teachers.email')}</th>
                <th className="px-4 py-3 text-start font-medium">{t('teachers.phone')}</th>
                <th className="px-4 py-3 text-start font-medium">{t('teachers.sign_in')}</th>
                <th className="px-4 py-3 text-start font-medium">
                  <span className="sr-only">{t('common.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.teachers.map((teacher) => {
                const status = teacherStatus(teacher);
                return (
                  <tr
                    key={teacher.id}
                    className="border-b"
                    style={{ borderColor: 'var(--color-border-default)' }}
                    data-testid="teacher-row"
                  >
                    <td className="px-4 py-3">{teacher.name}</td>
                    <td className="px-4 py-3">
                      <bdi dir="ltr">{teacher.email ?? ''}</bdi>
                    </td>
                    <td className="px-4 py-3">
                      <bdi dir="ltr">{teacher.phone ?? ''}</bdi>
                    </td>
                    <td className="px-4 py-3" data-testid={`teacher-status-${status}`}>
                      {statusLabel[status]}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {status === 'waiting' && (
                          <Button variant="secondary" size="sm" onClick={() => setSharing(teacher)}>
                            {t('teachers.copy_link')}
                          </Button>
                        )}
                        <Button variant="secondary" size="sm" onClick={() => setEditing(teacher)}>
                          {t('teachers.edit')}
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => setRemoving(teacher)}>
                          {t('teachers.remove')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={isAdding || editing !== null}
        title={editing ? t('teachers.edit_title') : t('teachers.add')}
        onClose={closeForm}
      >
        {(isAdding || editing) && (
          <TeacherForm
            key={editing?.id ?? 'new'}
            teacher={editing ?? undefined}
            onSubmit={save}
            onCancel={closeForm}
            isSaving={data.isCreating || data.isUpdating}
            error={formError}
          />
        )}
      </Modal>

      <Modal
        isOpen={sharing !== null}
        title={t('teachers.share_heading', { name: sharing?.name ?? '' })}
        onClose={() => setSharing(null)}
      >
        {sharing && <SignInShare teacher={sharing} />}
      </Modal>

      <Modal isOpen={removing !== null} title={t('teachers.remove')} onClose={() => setRemoving(null)} size="sm">
        {removing && (
          <div className="space-y-4">
            <p>{t('teachers.remove_confirm', { name: removing.name })}</p>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                disabled={data.isDeleting}
                onClick={() =>
                  data.deleteTeacher(removing.id, { onSuccess: () => setRemoving(null) })
                }
              >
                {data.isDeleting ? t('common.loading') : t('teachers.remove')}
              </Button>
              <Button variant="outline" onClick={() => setRemoving(null)} disabled={data.isDeleting}>
                {t('teachers.cancel')}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
