import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { SetPasswordDialog } from '@/components/shared/SetPasswordDialog';
import { ChangeLoginEmailDialog } from '@/components/shared/ChangeLoginEmail';

/**
 * One 'My account' button on the client and parent pages (13 Nov 2026: fewer buttons).
 * It opens a short list: messages and reminders, password, login email.
 * The contact-preferences dialog stays with the page, which opens it from other places too.
 */
export function AccountMenu({ onPreferences }: { onPreferences: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [loginEmailOpen, setLoginEmailOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node))
        setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <div ref={wrapRef} className='relative'>
      <Button
        variant='outline'
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        {t('nav.my_account')}
      </Button>
      {open && (
        <ul
          id={listId}
          className='absolute end-0 z-20 mt-1 min-w-[14rem] rounded-md border border-gray-200 bg-white p-1 shadow-lg'
        >
          <li>
            <button
              type='button'
              className='w-full rounded px-3 py-2 text-start text-sm hover:bg-gray-100'
              onClick={pick(onPreferences)}
            >
              {t('pages.portal.notification_preferences')}
            </button>
          </li>
          <li>
            <button
              type='button'
              className='w-full rounded px-3 py-2 text-start text-sm hover:bg-gray-100'
              onClick={pick(() => setPasswordOpen(true))}
            >
              {t('pages.portal.login_password')}
            </button>
          </li>
          <li>
            <button
              type='button'
              className='w-full rounded px-3 py-2 text-start text-sm hover:bg-gray-100'
              onClick={pick(() => setLoginEmailOpen(true))}
            >
              {t('login_email.change_title')}
            </button>
          </li>
        </ul>
      )}
      <SetPasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
      <ChangeLoginEmailDialog
        open={loginEmailOpen}
        onOpenChange={setLoginEmailOpen}
      />
    </div>
  );
}
