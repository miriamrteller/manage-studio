import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ConsentCheckboxes } from './ConsentCheckboxes';
import {
  MARKETING_KINDS,
  PHOTO_KINDS,
  recordConsents,
  usePersonConsents,
  type ConsentKind,
  type ConsentSource,
  type ConsentState,
} from '@/legal/consents';
import { useLegalLang } from '@/legal/useLegalDocument';

export interface PersonConsentPanelProps {
  tenantId: string;
  personId: string;
  personName?: string;
  studioName?: string;
  /** Photographer clients: portfolio opt-in instead of class photo purposes. */
  photographer?: boolean;
  /** Minors: no marketing options here (marketing belongs to the parent). */
  isMinor?: boolean;
  source: Extract<ConsentSource, 'admin' | 'portal'>;
  title?: string;
}

/**
 * View and change a person's consents (photo purposes or portfolio, marketing
 * per channel). Every save appends records with the wording shown — the
 * history is kept, nothing is overwritten. Used by admins (person page) and by
 * parents/clients (portal) to withdraw or give consent.
 */
export function PersonConsentPanel({
  tenantId,
  personId,
  personName,
  studioName,
  photographer = false,
  isMinor = false,
  source,
  title,
}: PersonConsentPanelProps) {
  const { t } = useTranslation();
  const lang = useLegalLang();
  const queryClient = useQueryClient();
  const { data: current, isLoading } = usePersonConsents(personId);
  const [photo, setPhoto] = useState<ConsentState>({});
  const [marketing, setMarketing] = useState<ConsentState>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!current) return;
    setPhoto(current);
    setMarketing(current);
  }, [current]);

  const photoKinds: ConsentKind[] = photographer ? ['portfolio'] : PHOTO_KINDS;
  const vars = { student: personName, studio: studioName };

  const save = async () => {
    if (!current) return;
    // Record only what changed (or was never recorded and is now ticked).
    const items: Array<{ kind: ConsentKind; granted: boolean }> = [];
    for (const kind of photoKinds) {
      const next = photo[kind] === true;
      if (current[kind] !== next && !(current[kind] === undefined && !next)) items.push({ kind, granted: next });
    }
    if (!isMinor) {
      for (const kind of MARKETING_KINDS) {
        const next = marketing[kind] === true;
        if (current[kind] !== next && !(current[kind] === undefined && !next)) items.push({ kind, granted: next });
      }
    }
    if (items.length === 0) {
      setMessage(t('legal.consents.no_changes'));
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await recordConsents({ tenantId, personId, items, lang, vars, source });
      await queryClient.invalidateQueries({ queryKey: ['person-consents', personId] });
      await queryClient.invalidateQueries({ queryKey: ['person', personId] });
      setMessage(t('legal.consents.saved'));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <p role="status">{t('common.loading')}</p>;

  return (
    <section className="space-y-4 p-4 bg-gray-50 rounded border" aria-label={title ?? t('legal.consents.title')}>
      <h3 className="font-semibold">{title ?? t('legal.consents.title')}</h3>
      <ConsentCheckboxes
        legend={photographer ? t('legal.consents.portfolio_legend') : t('legal.consents.photo_legend')}
        kinds={photoKinds}
        value={photo}
        onChange={setPhoto}
        lang={lang}
        vars={vars}
      />
      {!isMinor && (
        <ConsentCheckboxes
          legend={t('legal.consents.marketing_legend')}
          kinds={MARKETING_KINDS}
          value={marketing}
          onChange={setMarketing}
          lang={lang}
          vars={vars}
        />
      )}
      {source === 'admin' && <p className="text-xs text-muted-foreground">{t('legal.consents.admin_note')}</p>}
      {message && (
        <p className="text-sm" role="status">
          {message}
        </p>
      )}
      <Button type="button" variant="secondary" disabled={saving} onClick={() => void save()}>
        {t('legal.consents.save')}
      </Button>
    </section>
  );
}
