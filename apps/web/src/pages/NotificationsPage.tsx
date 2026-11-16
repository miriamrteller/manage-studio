import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NotificationLog } from '@/components/shared/NotificationLog';
import { NotificationBlastForm } from '@/features/notifications-admin/components/NotificationBlastForm';
import { ClassRemindersSetting } from '@/features/notifications-admin/components/ClassRemindersSetting';

export default function NotificationsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'compose' | 'history' | 'reminders'>('compose');

  const handleBlastSent = () => {
    void queryClient.invalidateQueries({ queryKey: ['notificationLog'] });
    setTab('history');
  };

  return (
    <div className="space-y-4 p-4">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">{t('pages.notifications.title')}</h1>
        <p className="text-gray-600">{t('pages.notifications.description')}</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'compose' | 'history' | 'reminders')}>
        <TabsList>
          <TabsTrigger value="compose">{t('pages.notifications.tab_compose')}</TabsTrigger>
          <TabsTrigger value="history">{t('pages.notifications.tab_history')}</TabsTrigger>
          <TabsTrigger value="reminders">{t('pages.notifications.tab_reminders')}</TabsTrigger>
        </TabsList>
        <TabsContent value="compose" className="pt-4">
          <NotificationBlastForm onSentSuccess={handleBlastSent} />
        </TabsContent>
        <TabsContent value="history" className="pt-4">
          <NotificationLog />
        </TabsContent>
        <TabsContent value="reminders" className="pt-4">
          <ClassRemindersSetting />
        </TabsContent>
      </Tabs>
    </div>
  );
}
