import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { PersonForm } from '@/features/people/components/PersonForm';
import { PersonService } from '@/features/people/service';
import { useTenant } from '@/hooks/useTenant';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { Person } from '@shared/schemas';

interface EditChildModalProps {
  child: Person;
  onClose: () => void;
}

export function EditChildModal({ child, onClose }: EditChildModalProps) {
  const { t } = useTranslation();
  const tenant = useTenant();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-child-title"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-lg"
      >
        <div className="flex items-center justify-between border-b p-4">
          <h2 id="edit-child-title" className="text-xl font-semibold">
            {t('pages.portal.edit_child_title', { name: child.name })}
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
            aria-label={t('common.close')}
          >
            ✕
          </Button>
        </div>

        <PersonForm
          person={child}
          variant="parent"
          onSubmit={async (data) => {
            if (!tenant) throw new Error('Tenant not initialized');
            await PersonService.updateForParent(tenant, child.id, data);
            await queryClient.invalidateQueries({
              queryKey: ['parent-portal', tenant.id, user?.id],
            });
            await queryClient.invalidateQueries({
              queryKey: ['account-students', tenant.id, user?.id],
            });
            onClose();
          }}
        />
      </div>
    </div>
  );
}
