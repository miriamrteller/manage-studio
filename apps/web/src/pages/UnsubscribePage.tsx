import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';

type State = { kind: 'working' } | { kind: 'done'; studio: string } | { kind: 'error' };

/**
 * /unsubscribe/:token — the one-click link in every marketing email.
 * Opens, records the opt-out, and confirms. No sign-in needed.
 */
export default function UnsubscribePage() {
  const { token } = useParams<{ token: string }>();
  const { t } = useTranslation();
  const [state, setState] = useState<State>({ kind: 'working' });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!token) {
      setState({ kind: 'error' });
      return;
    }
    void (async () => {
      const { data, error } = await supabase.functions.invoke('marketing-unsubscribe', { body: { token } });
      if (error || !data?.ok) setState({ kind: 'error' });
      else setState({ kind: 'done', studio: typeof data.studio === 'string' ? data.studio : '' });
    })();
  }, [token]);

  return (
    <section className="max-w-lg mx-auto py-12 px-4 text-center space-y-3">
      {state.kind === 'working' && <p role="status">{t('legal.unsubscribe.working')}</p>}
      {state.kind === 'done' && (
        <>
          <h1 className="text-2xl font-bold">{t('legal.unsubscribe.done_title')}</h1>
          <p role="status">{t('legal.unsubscribe.done_body', { studio: state.studio })}</p>
        </>
      )}
      {state.kind === 'error' && (
        <>
          <h1 className="text-2xl font-bold">{t('legal.unsubscribe.error_title')}</h1>
          <p role="alert">{t('legal.unsubscribe.error_body')}</p>
        </>
      )}
    </section>
  );
}
