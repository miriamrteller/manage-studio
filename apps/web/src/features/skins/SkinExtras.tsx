import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { ColourPresets } from '@/components/colour/ColourPresets';
import { OPALSWIFT_BRAND } from '@/lib/theme/opalswiftBrand';
import { onColor } from '@/lib/theme/color';
import {
  GENERAL_PROFILE,
  isBuiltInSkin,
  PRESET_QUESTIONS,
  PRESETS_BY_KIND,
  profileFromSkin,
  resolveStudioLabels,
  safeVertical,
  skinLabelsFor,
  skinName,
  type LeadFormKind,
  type PresetKey,
  type Skin,
} from '@shared/index';
import { signedFormsForSkin } from '@shared/legal/signed-template';

const HEX = /^#[0-9A-Fa-f]{6}$/;
const KINDS: LeadFormKind[] = ['classes', 'photography', 'general'];

/** Ready-made enquiry questions for new studios on this skin, grouped as in Settings. */
export function EnquiryQuestionsField({ skin, onChange }: { skin: Skin; onChange: (keys: PresetKey[]) => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('he') ? 'he' : 'en';
  const toggle = (key: PresetKey, on: boolean) => {
    const next = on ? [...skin.enquiryPresets, key] : skin.enquiryPresets.filter((k) => k !== key);
    // Keep the ready-made order, whatever order they were ticked in.
    onChange((Object.keys(PRESET_QUESTIONS) as PresetKey[]).filter((k) => next.includes(k)));
  };
  return (
    <fieldset className="space-y-3">
      <legend className="text-lg font-semibold">{t('skins.section_enquiry')}</legend>
      <p className="text-sm text-gray-700">{t('skins.enquiry_hint')}</p>
      <div className="grid gap-4 md:grid-cols-3">
        {KINDS.map((kind) => (
          <fieldset key={kind} className="space-y-1">
            <legend className="text-sm font-medium">{t(`skins.enquiry_group_${kind}`)}</legend>
            {PRESETS_BY_KIND[kind].map((key) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={skin.enquiryPresets.includes(key)}
                  onChange={(e) => toggle(key, e.target.checked)}
                />
                <span>{PRESET_QUESTIONS[key].label[lang]}</span>
              </label>
            ))}
          </fieldset>
        ))}
      </div>
    </fieldset>
  );
}

/** Starting colours for new studios on this skin (empty = OpalSwift's colours). */
export function ColoursField({ skin, onChange }: { skin: Skin; onChange: (colours: Skin['colours']) => void }) {
  const { t } = useTranslation();
  const uid = useId();
  const primary = skin.colours.primary ?? '';
  const accent = skin.colours.accent ?? '';
  const set = (key: 'primary' | 'accent', value: string) => {
    const next = { ...skin.colours };
    if (value.trim()) next[key] = value.trim();
    else delete next[key];
    onChange(next);
  };
  return (
    <fieldset className="space-y-3">
      <legend className="text-lg font-semibold">{t('skins.section_colours')}</legend>
      <p className="text-sm text-gray-700">{t('skins.colours_hint')}</p>
      <ColourPresets
        primary={primary || OPALSWIFT_BRAND.primary}
        accent={accent || OPALSWIFT_BRAND.accent}
        onPick={(p, a) => onChange({ primary: p, accent: a })}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {(['primary', 'accent'] as const).map((key) => {
          const value = key === 'primary' ? primary : accent;
          const invalid = Boolean(value) && !HEX.test(value);
          return (
            <div key={key} className="space-y-1">
              <label htmlFor={`${uid}-${key}`} className="block text-sm font-medium">{t(`skins.colour_${key}`)}</label>
              <div className="flex items-center gap-2" dir="ltr">
                <input
                  type="color"
                  aria-hidden="true"
                  tabIndex={-1}
                  className="h-10 w-14"
                  value={HEX.test(value) ? value : key === 'primary' ? OPALSWIFT_BRAND.primary : OPALSWIFT_BRAND.accent}
                  onChange={(e) => set(key, e.target.value)}
                />
                <input
                  id={`${uid}-${key}`}
                  className="form-input font-mono"
                  placeholder="#5B6CFF"
                  value={value}
                  onChange={(e) => set(key, e.target.value)}
                  aria-invalid={invalid}
                  aria-describedby={invalid ? `${uid}-${key}-error` : undefined}
                />
              </div>
              {invalid && <p id={`${uid}-${key}-error`} className="text-sm text-red-800">{t('skins.error_colour')}</p>}
            </div>
          );
        })}
      </div>
      {(primary || accent) && (
        <button type="button" className="text-sm underline" onClick={() => onChange({})}>
          {t('skins.colours_reset')}
        </button>
      )}
    </fieldset>
  );
}

/**
 * What a new studio on this skin starts with: its colours, menu words, switches,
 * enquiry questions and signed forms. A sample, no real studio's data.
 */
export function SkinPreview({ skin }: { skin: Skin }) {
  const { t, i18n } = useTranslation();
  const uid = useId();
  const lang = i18n.language.startsWith('he') ? 'he' : 'en';
  const primary = HEX.test(skin.colours.primary ?? '') ? skin.colours.primary! : OPALSWIFT_BRAND.primary;
  const accent = HEX.test(skin.colours.accent ?? '') ? skin.colours.accent! : OPALSWIFT_BRAND.accent;
  const profile = profileFromSkin(skin, GENERAL_PROFILE);
  const vertical = isBuiltInSkin(skin.id) ? skin.id : safeVertical(skin.id);
  const words = resolveStudioLabels(profile, {}, lang, vertical, skinLabelsFor(skin, lang));
  const forms = signedFormsForSkin(skin.id, skin.legalAddon);
  const name = skinName(skin, lang) || t('skins.preview_unnamed');

  const menu = [
    words.contact.plural,
    ...(profile.teachesClasses ? [words.offering.plural, words.season.plural] : [words.offering.plural]),
    ...(profile.paymentFlow !== 'recurring' ? [words.engagement.plural] : []),
    ...(profile.clientBooking ? [words.session.plural] : []),
  ];
  const switches = [
    t(`settings.business.flow_${profile.paymentFlow}`),
    ...(profile.teachesClasses ? [t('skins.switch_teaches_classes')] : []),
    ...(profile.familyAccounts ? [t('skins.switch_family_accounts')] : []),
    ...(profile.clientBooking ? [t('skins.switch_client_booking')] : []),
  ];

  return (
    <section aria-labelledby={`${uid}-title`} className="space-y-3">
      <h2 id={`${uid}-title`} className="text-lg font-semibold">{t('skins.section_preview')}</h2>
      <p className="text-sm text-gray-700">{t('skins.preview_hint')}</p>
      <div className="overflow-hidden rounded-xl border border-border bg-white">
        <div className="px-4 py-3" style={{ backgroundColor: primary, color: onColor(primary) }}>
          <p className="font-semibold">{t('skins.preview_studio', { field: name })}</p>
        </div>
        <div className="grid gap-4 p-4 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold">{t('skins.preview_menu')}</h3>
            <ul className="mt-1 flex flex-wrap gap-2">
              {menu.map((item, i) => (
                <li key={`${item}-${i}`} className="rounded-full border px-3 py-1 text-sm" style={{ borderColor: accent }}>{item}</li>
              ))}
            </ul>
            <p className="mt-3">
              <span className="inline-block rounded-md px-3 py-1.5 text-sm font-medium" style={{ backgroundColor: primary, color: onColor(primary) }}>
                {t('skins.preview_add', { noun: words.contact.singular })}
              </span>
            </p>
          </div>
          <div className="space-y-3 text-sm">
            <div>
              <h3 className="font-semibold">{t('skins.preview_switches')}</h3>
              <ul className="list-disc ps-5">{switches.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
            <div>
              <h3 className="font-semibold">{t('skins.preview_enquiry')}</h3>
              {skin.enquiryPresets.length > 0 ? (
                <ul className="list-disc ps-5">
                  {skin.enquiryPresets.map((k) => <li key={k}>{PRESET_QUESTIONS[k].label[lang]}</li>)}
                </ul>
              ) : (
                <p className="text-gray-700">{t('skins.preview_enquiry_usual')}</p>
              )}
            </div>
            <div>
              <h3 className="font-semibold">{t('skins.preview_forms')}</h3>
              <ul className="list-disc ps-5">
                {forms.map((f) => (
                  <li key={f.key}>
                    {f.title[lang]}
                    {f.addon && <span className="text-gray-700"> {t('skins.preview_with_addon', { addon: t(`skins.legal_${f.addon.replace('addon-', '')}`) })}</span>}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
