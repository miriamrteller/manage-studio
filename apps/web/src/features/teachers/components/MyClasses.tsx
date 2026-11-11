import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ClassRegister } from '@/features/attendance/components/ClassRegister';
import { formatTime } from '@shared/format';
import { EmptyState } from '@/components/shared';
import { useMyTeaching } from '../hooks/useTeachers';
import type { MyTeachingClass } from '../service';

function ClassCard({ item }: { item: MyTeachingClass }) {
  const { t, i18n } = useTranslation();
  const [registerOpen, setRegisterOpen] = useState(false);
  return (
    <li className="card space-y-1" data-testid="my-class">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">{item.name}</h2>
        {item.mine && (
          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium" data-testid="my-class-mine">
            {t('my_classes.mine')}
          </span>
        )}
      </div>
      <p className="text-sm text-gray-700">
        {item.day_of_week != null ? `${t(`form.class.day_${item.day_of_week}`)}, ` : ''}
        {item.start_time && (
          <bdi dir="ltr">
            {formatTime(item.start_time, i18n.language)}
            {item.end_time ? ` – ${formatTime(item.end_time, i18n.language)}` : ''}
          </bdi>
        )}
        {item.location ? ` · ${item.location}` : ''}
      </p>
      <p className="text-sm text-gray-700">
        {[
          item.season_name,
          item.mine ? null : item.teacher_name ? t('my_classes.taught_by', { name: item.teacher_name }) : t('my_classes.no_teacher'),
          t('my_classes.enrolled', { count: item.enrolled }),
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      <div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRegisterOpen((open) => !open)}
          aria-expanded={registerOpen}
          data-testid="my-class-register"
        >
          {t('attendance.register.button')}
        </Button>
      </div>
      {registerOpen && (
        <ClassRegister
          offeringId={item.id}
          className={item.name}
          dayOfWeek={item.day_of_week}
          isAdmin={false}
        />
      )}
    </li>
  );
}

/** Teacher → My classes: the classes the studio lets them see, their own first. */
export function MyClasses() {
  const { t } = useTranslation();
  const { data, isLoading, error } = useMyTeaching();

  return (
    <div className="space-y-4 p-4">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">{t('my_classes.title')}</h1>
        {data && data.classes.length > 0 && (
          <p className="text-gray-600">
            {data.own_classes_only ? t('my_classes.intro_own') : t('my_classes.intro_all')}
          </p>
        )}
      </div>

      {isLoading && <div className="py-4 text-center">{t('common.loading')}</div>}
      {error && (
        <div className="alert-error" role="alert">
          {t('my_classes.error')}
        </div>
      )}

      {data && data.classes.length === 0 && (
        <EmptyState title={t('my_classes.empty_title')} message={t('my_classes.empty_message')} />
      )}

      {data && data.classes.length > 0 && (
        <ul className="space-y-3">
          {data.classes.map((item) => (
            <ClassCard key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}
