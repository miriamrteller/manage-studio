import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import {
  emptySkin,
  isBuiltInSkin,
  LEGAL_ADDONS,
  SKIN_NOUN_KEYS,
  skinErrors,
  skinName,
  type EntityKey,
  type LegalAddon,
  type Skin,
} from '@shared/index';
import { useAllSkins, useSaveSkin, useSkinUsage } from './useSkins';
import { ColoursField, EnquiryQuestionsField, SkinPreview } from './SkinExtras';
import { isShippedLegalAddon } from '@shared/legal/signed-template';

type Editing = { skin: Skin; isNew: boolean; wasLive: boolean } | null;

/**
 * /platform/skins (platform owner only): every skin, how many studios use it,
 * and a form to create or edit one. Saving is never blocked by the warnings.
 */
export default function SkinsPage() {
  const { t, i18n } = useTranslation();
  const skins = useAllSkins();
  const usage = useSkinUsage();
  const [editing, setEditing] = useState<Editing>(null);
  const [saved, setSaved] = useState<string | null>(null);

  if (editing) {
    return (
      <div className="p-6 max-w-4xl">
        <SkinEditor
          key={editing.skin.id || 'new'}
          initial={editing.skin}
          isNew={editing.isNew}
          wasLive={editing.wasLive}
          studios={usage.data?.[editing.skin.id] ?? 0}
          takenIds={(skins.data ?? []).map((s) => s.id)}
          onDone={(name) => {
            setEditing(null);
            setSaved(name);
          }}
          onCancel={() => setEditing(null)}
        />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t('skins.title')}</h1>
          <p className="text-sm text-gray-700">{t('skins.intro')}</p>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            setSaved(null);
            setEditing({ skin: emptySkin(), isNew: true, wasLive: false });
          }}
        >
          {t('skins.new')}
        </Button>
      </div>

      {saved && (
        <Alert variant="success" onDismiss={() => setSaved(null)} dismissLabel={t('skins.dismiss')}>
          {t('skins.saved', { name: saved })}
        </Alert>
      )}
      {skins.isError && <Alert variant="destructive">{t('skins.load_failed')}</Alert>}
      {skins.isLoading && <p role="status">{t('skins.loading')}</p>}

      {skins.data && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <caption className="sr-only">{t('skins.title')}</caption>
            <thead className="bg-gray-50 text-start">
              <tr>
                <th scope="col" className="p-3 text-start">{t('skins.col_name')}</th>
                <th scope="col" className="p-3 text-start">{t('skins.col_status')}</th>
                <th scope="col" className="p-3 text-start">{t('skins.col_studios')}</th>
                <th scope="col" className="p-3 text-start"><span className="sr-only">{t('skins.col_actions')}</span></th>
              </tr>
            </thead>
            <tbody>
              {skins.data.map((skin) => (
                <tr key={skin.id} className="border-t border-border">
                  <th scope="row" className="p-3 text-start font-medium">
                    {skinName(skin, i18n.language)}
                    <span className="block text-xs font-normal text-gray-700" dir="ltr">{skin.id}</span>
                  </th>
                  <td className="p-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${skin.status === 'live' ? 'bg-green-50 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                      {t(`skins.status_${skin.status}`)}
                    </span>
                  </td>
                  <td className="p-3">{usage.data ? (usage.data[skin.id] ?? 0) : '…'}</td>
                  <td className="p-3 text-end">
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={t('skins.edit_named', { name: skinName(skin, i18n.language) })}
                      onClick={() => {
                        setSaved(null);
                        setEditing({ skin, isNew: false, wasLive: skin.status === 'live' });
                      }}
                    >
                      {t('skins.edit')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface EditorProps {
  initial: Skin;
  isNew: boolean;
  wasLive: boolean;
  studios: number;
  takenIds: string[];
  onDone: (name: string) => void;
  onCancel: () => void;
}

function SkinEditor({ initial, isNew, wasLive, studios, takenIds, onDone, onCancel }: EditorProps) {
  const { t, i18n } = useTranslation();
  const uid = useId();
  const [skin, setSkin] = useState<Skin>(initial);
  const [showErrors, setShowErrors] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const save = useSaveSkin();
  const builtIn = isBuiltInSkin(skin.id) && !isNew;

  const errors = skinErrors(skin);
  if (isNew && takenIds.includes(skin.id)) errors.push('id_taken');
  const has = (key: string) => showErrors && errors.includes(key);

  function set<K extends keyof Skin>(key: K, value: Skin[K]) {
    setSkin((prev) => ({ ...prev, [key]: value }));
  }

  function setLabel(locale: 'en' | 'he', key: EntityKey, part: 'singular' | 'plural', value: string) {
    setSkin((prev) => {
      const current = prev.labels[locale]?.[key] ?? { singular: '', plural: '' };
      const next = { ...current, [part]: value };
      const localeLabels = { ...(prev.labels[locale] ?? {}) };
      if (!next.singular && !next.plural) delete localeLabels[key];
      else localeLabels[key] = next;
      return { ...prev, labels: { ...prev.labels, [locale]: localeLabels } };
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaveError(null);
    if (errors.length > 0) {
      setShowErrors(true);
      return;
    }
    try {
      await save.mutateAsync({ skin, isNew });
      onDone(skinName(skin, i18n.language));
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setSaveError(message === 'skin_id_taken' ? t('skins.error_id_taken') : t('skins.save_failed', { reason: message }));
    }
  }

  const field = (id: string) => `${uid}-${id}`;
  const errorText = (key: string, messageKey: string) =>
    has(key) ? (
      <p id={field(`${key}-error`)} className="text-sm text-red-800">{t(messageKey)}</p>
    ) : null;

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <h1 className="text-2xl font-semibold">
        {isNew ? t('skins.new') : t('skins.edit_named', { name: skinName(initial, i18n.language) })}
      </h1>

      {wasLive && studios > 0 && (
        <Alert variant="warning">
          {t('skins.live_warning', { count: studios })}
          {builtIn && <span className="block">{t('skins.builtin_note')}</span>}
        </Alert>
      )}

      <fieldset className="space-y-3">
        <legend className="text-lg font-semibold">{t('skins.section_names')}</legend>
        {isNew && (
          <div className="space-y-1">
            <label htmlFor={field('id')} className="block text-sm font-medium">{t('skins.id')}</label>
            <input
              id={field('id')}
              className="form-input w-full"
              dir="ltr"
              value={skin.id}
              onChange={(e) => set('id', e.target.value.trim().toLowerCase())}
              aria-invalid={has('id') || has('id_taken')}
              aria-describedby={`${field('id-hint')} ${has('id') ? field('id-error') : ''} ${has('id_taken') ? field('id_taken-error') : ''}`.trim()}
            />
            <p id={field('id-hint')} className="text-sm text-gray-700">{t('skins.id_hint')}</p>
            {errorText('id', 'skins.error_id')}
            {errorText('id_taken', 'skins.error_id_taken')}
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          {(['en', 'he'] as const).map((locale) => {
            const nameKey = locale === 'en' ? 'nameEn' : 'nameHe';
            const hintKey = locale === 'en' ? 'hintEn' : 'hintHe';
            return (
              <div key={locale} className="space-y-3" dir={locale === 'he' ? 'rtl' : 'ltr'} lang={locale}>
                <div className="space-y-1">
                  <label htmlFor={field(`name-${locale}`)} className="block text-sm font-medium">{t(`skins.name_${locale}`)}</label>
                  <input
                    id={field(`name-${locale}`)}
                    className="form-input w-full"
                    value={skin[nameKey]}
                    maxLength={80}
                    onChange={(e) => set(nameKey, e.target.value)}
                    aria-invalid={has(`name_${locale}`)}
                    aria-describedby={has(`name_${locale}`) ? field(`name_${locale}-error`) : undefined}
                  />
                  {errorText(`name_${locale}`, 'skins.error_name')}
                </div>
                <div className="space-y-1">
                  <label htmlFor={field(`hint-${locale}`)} className="block text-sm font-medium">{t(`skins.hint_${locale}`)}</label>
                  <input
                    id={field(`hint-${locale}`)}
                    className="form-input w-full"
                    value={skin[hintKey]}
                    maxLength={160}
                    onChange={(e) => set(hintKey, e.target.value)}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <div className="space-y-1">
          <label htmlFor={field('pages')} className="block text-sm font-medium">{t('skins.marketing_pages')}</label>
          <input
            id={field('pages')}
            className="form-input w-full"
            dir="ltr"
            value={skin.marketingPages.join(', ')}
            onChange={(e) =>
              set(
                'marketingPages',
                e.target.value
                  .split(',')
                  .map((p) => p.trim().toLowerCase())
                  .filter(Boolean),
              )
            }
            aria-describedby={field('pages-hint')}
          />
          <p id={field('pages-hint')} className="text-sm text-gray-700">{t('skins.marketing_pages_hint')}</p>
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-lg font-semibold">{t('skins.section_status')}</legend>
        {(['draft', 'live'] as const).map((status) => (
          <div key={status} className="text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={field('status')}
                checked={skin.status === status}
                onChange={() => set('status', status)}
                aria-describedby={field(`status-${status}-hint`)}
              />
              <span className="font-medium">{t(`skins.status_${status}`)}</span>
            </label>
            <p id={field(`status-${status}-hint`)} className="ms-6 text-gray-700">{t(`skins.status_${status}_hint`)}</p>
          </div>
        ))}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-lg font-semibold">{t('skins.section_switches')}</legend>
        <p className="text-sm text-gray-700">{t('skins.switches_hint')}</p>
        <fieldset className="space-y-1">
          <legend className="text-sm font-medium">{t('settings.business.flow_legend')}</legend>
          <div className="flex flex-wrap gap-4">
            {(['recurring', 'project', 'both'] as const).map((flow) => (
              <label key={flow} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={field('flow')}
                  checked={(skin.switches.paymentFlow ?? 'both') === flow}
                  onChange={() => set('switches', { ...skin.switches, paymentFlow: flow })}
                />
                <span>{t(`settings.business.flow_${flow}`)}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {(
          [
            ['teachesClasses', 'skins.switch_teaches_classes'],
            ['familyAccounts', 'skins.switch_family_accounts'],
            ['clientBooking', 'skins.switch_client_booking'],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(skin.switches[key])}
              onChange={(e) => set('switches', { ...skin.switches, [key]: e.target.checked })}
            />
            <span>{t(label)}</span>
          </label>
        ))}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-lg font-semibold">{t('skins.section_words')}</legend>
        {builtIn ? (
          <p className="text-sm text-gray-700">{t('skins.builtin_words')}</p>
        ) : (
          <>
            <p className="text-sm text-gray-700">{t('skins.words_hint')}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">{t('skins.section_words')}</caption>
                <thead>
                  <tr>
                    <th scope="col" className="p-2 text-start">{t('skins.col_word')}</th>
                    <th scope="col" className="p-2 text-start" lang="en">{t('skins.word_en_singular')}</th>
                    <th scope="col" className="p-2 text-start" lang="en">{t('skins.word_en_plural')}</th>
                    <th scope="col" className="p-2 text-start" lang="he">{t('skins.word_he_singular')}</th>
                    <th scope="col" className="p-2 text-start" lang="he">{t('skins.word_he_plural')}</th>
                  </tr>
                </thead>
                <tbody>
                  {SKIN_NOUN_KEYS.map((key) => (
                    <tr key={key} className="border-t border-border">
                      <th scope="row" className="p-2 text-start font-medium">{t(`skins.noun_${key}`)}</th>
                      {(['en', 'he'] as const).flatMap((locale) =>
                        (['singular', 'plural'] as const).map((part) => (
                          <td key={`${locale}-${part}`} className="p-2">
                            <input
                              className="form-input w-full min-w-24"
                              dir={locale === 'he' ? 'rtl' : 'ltr'}
                              lang={locale}
                              maxLength={40}
                              aria-label={t('skins.word_input', { noun: t(`skins.noun_${key}`), form: t(`skins.word_${locale}_${part}`) })}
                              aria-invalid={has(`label_${locale}_${key}`)}
                              value={skin.labels[locale]?.[key]?.[part] ?? ''}
                              onChange={(e) => setLabel(locale, key, part, e.target.value)}
                            />
                          </td>
                        )),
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {showErrors && errors.some((e) => e.startsWith('label_')) && (
              <p className="text-sm text-red-800">{t('skins.error_word_pair')}</p>
            )}
          </>
        )}
      </fieldset>

      <fieldset className="space-y-1">
        <legend className="text-lg font-semibold">{t('skins.section_legal')}</legend>
        <label htmlFor={field('legal')} className="block text-sm font-medium">{t('skins.legal_addon')}</label>
        <select
          id={field('legal')}
          className="form-input w-full md:w-80"
          value={skin.legalAddon ?? ''}
          onChange={(e) => set('legalAddon', (e.target.value || null) as LegalAddon | null)}
          aria-describedby={field('legal-hint')}
        >
          <option value="">{t('skins.legal_none')}</option>
          {LEGAL_ADDONS.map((addon) => (
            <option key={addon} value={addon}>{t(`skins.legal_${addon}`)}</option>
          ))}
        </select>
        <p id={field('legal-hint')} className="text-sm text-gray-700">
          {t('skins.legal_hint')}
          {skin.legalAddon && !isShippedLegalAddon(skin.legalAddon) && <span className="block">{t('skins.legal_not_shipped')}</span>}
        </p>
      </fieldset>

      <EnquiryQuestionsField skin={skin} onChange={(keys) => set('enquiryPresets', keys)} />
      <ColoursField skin={skin} onChange={(colours) => set('colours', colours)} />
      <SkinPreview skin={skin} />

      {showErrors && errors.length > 0 && <Alert variant="destructive">{t('skins.fix_errors')}</Alert>}
      {saveError && <Alert variant="destructive">{saveError}</Alert>}

      <div className="flex gap-3">
        <Button type="submit" variant="primary" disabled={save.isPending}>
          {save.isPending ? t('skins.saving') : t('skins.save')}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>{t('skins.cancel')}</Button>
      </div>
    </form>
  );
}
