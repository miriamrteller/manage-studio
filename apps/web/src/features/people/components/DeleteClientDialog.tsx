import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useTenant } from '@/hooks/useTenant';
import { PersonService, type DeleteClientResult } from '../service';

interface DeleteClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personId: string;
  personName: string;
  /** Called after the client is deleted (leave the page or close the panel). */
  onDeleted: () => void;
}

/**
 * Delete a client added by mistake. Opening the dialog checks what would go. When the
 * client has payments, orders or signed forms nothing is deleted: the dialog offers
 * "Set to Inactive" instead, so financial and legal records are kept.
 */
export function DeleteClientDialog({ open, onOpenChange, personId, personName, onDeleted }: DeleteClientDialogProps) {
  const { t } = useTranslation();
  const tenant = useTenant();
  const queryClient = useQueryClient();
  const [check, setCheck] = useState<DeleteClientResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setCheck(null);
    setFailed(false);
    PersonService.deleteClient(personId, false)
      .then((result) => live && setCheck(result))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [open, personId]);

  const refreshLists = async () => {
    if (!tenant) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['students', tenant.id] }),
      queryClient.invalidateQueries({ queryKey: ['people', tenant.id] }),
      queryClient.invalidateQueries({ queryKey: ['student-detail-person', tenant.id, personId] }),
    ]);
  };

  const close = () => {
    if (busy) return;
    onOpenChange(false);
  };

  const confirmDelete = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const result = await PersonService.deleteClient(personId, true);
      if (!result.deleted) {
        setCheck(result);
        return;
      }
      onOpenChange(false);
      onDeleted();
      void refreshLists();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const setInactive = async () => {
    if (!tenant) return;
    setBusy(true);
    setFailed(false);
    try {
      await PersonService.update(tenant, personId, { status: 'inactive' });
      await refreshLists();
      onOpenChange(false);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const kept = check !== null && !check.can_delete;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('pages.people.delete_client.title', { name: personName })}</DialogTitle>
          <DialogDescription>
            {check === null && !failed && t('pages.people.delete_client.checking')}
            {check?.can_delete && t('pages.people.delete_client.confirm')}
            {kept && t('pages.people.delete_client.kept')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {check?.can_delete && check.people > 1 && (
            <p className="text-sm">{t('pages.people.delete_client.family_too')}</p>
          )}
          {check?.can_delete && check.shoots > 0 && (
            <p className="text-sm">{t('pages.people.delete_client.shoots_too')}</p>
          )}
          {failed && (
            <p className="text-sm text-destructive" role="alert">
              {t('common.error')}
            </p>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="outline" onClick={close} disabled={busy}>
              {t('common.cancel')}
            </Button>
            {kept ? (
              <Button type="button" variant="primary" onClick={() => void setInactive()} isLoading={busy}>
                {t('pages.people.delete_client.set_inactive')}
              </Button>
            ) : (
              <Button
                type="button"
                variant="destructive"
                onClick={() => void confirmDelete()}
                isLoading={busy}
                disabled={!check?.can_delete}
              >
                {t('pages.people.delete_client.delete_for_good')}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
