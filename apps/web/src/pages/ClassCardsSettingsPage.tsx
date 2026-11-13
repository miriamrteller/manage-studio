import { useTranslation } from 'react-i18next';
import { ClassCardSettings } from '@/features/class-cards/components/ClassCardSettings';

/** Classes → Class cards (/admin/classes/cards). Was a section of Settings. */
export default function ClassCardsSettingsPage() {
  const { t } = useTranslation();
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-3xl font-bold">{t('settings.tabs.class_cards')}</h1>
      <ClassCardSettings />
    </div>
  );
}
