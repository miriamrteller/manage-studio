import { useEffect, useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { MessageCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { askAssistant, type AssistantPrefill, type AssistantReply, type AssistantTurn } from './askAssistant';
import type { AssistantExchange } from './AssistantContext';

const MAX_QUESTION_CHARS = 1000;

interface AssistantPanelProps {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  exchanges: AssistantExchange[];
  setExchanges: Dispatch<SetStateAction<AssistantExchange[]>>;
  onShowMe: (guideId: string) => void;
}

/** Earlier questions and answers, for follow-ups ("and then?"). Errors are left out. */
function historyOf(exchanges: AssistantExchange[]): AssistantTurn[] {
  return exchanges.flatMap((x): AssistantTurn[] =>
    x.result?.ok ? [{ role: 'user', text: x.question }, { role: 'assistant', text: x.result.reply.answer }] : [],
  );
}

/** Where "Fill it in for me" goes, and the router state that page reads. */
export function prefillTarget(prefill: AssistantPrefill): { path: string; state: Record<string, unknown> } {
  if (prefill.kind === 'package') {
    const { kind: _kind, ...newPackage } = prefill;
    return { path: '/admin/bookings/packages', state: { newPackage } };
  }
  const { kind: _kind, ...newShoot } = prefill;
  return { path: '/admin/projects', state: { newShoot } };
}

/**
 * The "Ask OpalSwift" button and panel. Answers come from the help guides only;
 * nothing here saves anything. "Fill it in for me" opens the form with the details
 * filled in, and the admin checks it and presses Save or Create themself.
 */
export function AssistantPanel({ isOpen, onOpen, onClose, exchanges, setExchanges, onShowMe }: AssistantPanelProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [filledIn, setFilledIn] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [exchanges.length, busy]);

  const language: 'en' | 'he' = i18n.language?.startsWith('he') ? 'he' : 'en';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const text = question.trim().slice(0, MAX_QUESTION_CHARS);
    if (!text || busy) return;
    const id = Date.now();
    const history = historyOf(exchanges);
    setExchanges((prev) => [...prev, { id, question: text, result: null }]);
    setQuestion('');
    setFilledIn(false);
    setBusy(true);
    const result = await askAssistant({ question: text, language, route: location.pathname, history });
    setExchanges((prev) => prev.map((x) => (x.id === id ? { ...x, result } : x)));
    if (result.ok && result.remaining !== null) setRemaining(result.remaining);
    if (!result.ok && result.code === 'daily_limit') setRemaining(0);
    setBusy(false);
  };

  const fillIn = (prefill: AssistantPrefill) => {
    const target = prefillTarget(prefill);
    navigate(target.path, { state: target.state });
    setFilledIn(true);
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="fixed bottom-4 end-4 z-40 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-on-primary shadow-lg focus-visible:outline-2 outline-offset-2 print:hidden"
      >
        <MessageCircle className="h-5 w-5" aria-hidden="true" />
        <span>{t('assistant.button')}</span>
      </button>
    );
  }

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="assistant-title"
      className="fixed bottom-4 end-4 z-40 flex max-h-[min(36rem,calc(100vh-2rem))] w-[min(24rem,calc(100vw-2rem))] flex-col rounded-lg border bg-white text-gray-900 shadow-xl print:hidden"
    >
      <header className="flex items-start justify-between gap-2 border-b p-3">
        <div className="space-y-1">
          <h2 id="assistant-title" className="font-semibold">{t('assistant.title')}</h2>
          <p className="text-xs text-gray-600">{t('assistant.ai_notice')}</p>
          <p className="text-xs text-gray-600">{t('assistant.sensitive_notice')}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded p-1 hover:bg-gray-100" aria-label={t('assistant.close')}>
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-3" aria-live="polite">
        {exchanges.length === 0 && <p className="text-sm text-gray-600">{t('assistant.empty')}</p>}
        {exchanges.map((x) => (
          <div key={x.id} className="space-y-2">
            <p className="ms-8 rounded-lg bg-gray-100 p-2 text-sm" dir="auto">
              <span className="sr-only">{t('assistant.you')}: </span>
              {x.question}
            </p>
            {x.result === null ? (
              <p className="text-sm text-gray-600">{t('assistant.asking')}</p>
            ) : !x.result.ok ? (
              <p className="text-sm text-red-700" role="alert">
                {t(`assistant.errors.${x.result.code}`)}
              </p>
            ) : (
              <ReplyView reply={x.result.reply} onShowMe={onShowMe} onFillIn={fillIn} onLeave={onClose} />
            )}
          </div>
        ))}
        {filledIn && (
          <p className="rounded bg-blue-50 p-2 text-sm" role="status">
            {t('assistant.fill_in_done')}
          </p>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="space-y-2 border-t p-3">
        <label htmlFor="assistant-question" className="sr-only">
          {t('assistant.question_label')}
        </label>
        <textarea
          id="assistant-question"
          ref={inputRef}
          rows={2}
          dir="auto"
          maxLength={MAX_QUESTION_CHARS}
          className="w-full rounded border px-3 py-2 text-sm"
          placeholder={t('assistant.placeholder')}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-gray-600">
            {remaining !== null ? t('assistant.remaining', { count: remaining }) : ''}
          </span>
          <Button type="submit" size="sm" variant="primary" disabled={!question.trim() || busy || remaining === 0} isLoading={busy}>
            {t('assistant.ask')}
          </Button>
        </div>
      </form>
    </section>
  );
}

function ReplyView({
  reply,
  onShowMe,
  onFillIn,
  onLeave,
}: {
  reply: AssistantReply;
  onShowMe: (guideId: string) => void;
  onFillIn: (prefill: AssistantPrefill) => void;
  onLeave: () => void;
}) {
  const { t } = useTranslation();
  const { showMe, prefill } = reply;
  return (
    <div className="space-y-2 text-sm">
      <p className="whitespace-pre-line" dir="auto">{reply.answer}</p>
      {reply.unknownReason === 'missing_guide' && <p className="text-xs text-gray-600">{t('assistant.gap_noted')}</p>}
      {reply.guideIds.length > 0 && (
        <p className="text-xs">
          {t('assistant.sources')}{' '}
          {reply.guideIds.map((id, i) => (
            <span key={id}>
              {i > 0 && ', '}
              <Link to={`/admin/help#help-${id}`} className="underline" onClick={onLeave}>
                {t(`help.topics.${id}.title`)}
              </Link>
            </span>
          ))}
        </p>
      )}
      {(showMe || prefill) && (
        <div className="flex flex-wrap gap-2">
          {showMe && (
            <Button type="button" size="sm" variant="primary" onClick={() => onShowMe(showMe)}>
              {t('assistant.show_me')}
            </Button>
          )}
          {prefill && (
            <Button type="button" size="sm" variant="outline" onClick={() => onFillIn(prefill)}>
              {t('assistant.fill_in')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
