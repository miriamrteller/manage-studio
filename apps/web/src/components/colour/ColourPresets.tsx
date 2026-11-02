import { useTranslation } from 'react-i18next';

/** Ready-made colour pairs, so nobody has to know what a hex code is. */
export const COLOUR_PRESETS = [
  { id: 'opal', primary: '#5B6CFF', accent: '#21D1C2' },
  { id: 'rose', primary: '#BE123C', accent: '#F59E0B' },
  { id: 'forest', primary: '#15803D', accent: '#EAB308' },
  { id: 'ocean', primary: '#0369A1', accent: '#14B8A6' },
  { id: 'plum', primary: '#7E22CE', accent: '#EC4899' },
  { id: 'charcoal', primary: '#1F2937', accent: '#F97316' },
] as const;

export function ColourPresets({
  primary,
  accent,
  onPick,
}: {
  primary: string;
  accent: string;
  onPick: (primary: string, accent: string) => void;
}) {
  const { t } = useTranslation();
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{t('colour_presets.title')}</legend>
      <div className="flex flex-wrap gap-3">
        {COLOUR_PRESETS.map((p) => {
          const selected = same(p.primary, primary) && same(p.accent, accent);
          const name = t(`colour_presets.${p.id}`);
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={selected}
              aria-label={name}
              title={name}
              onClick={() => onPick(p.primary, p.accent)}
              className={`flex h-11 w-11 overflow-hidden rounded-full border-2 outline-offset-2 focus-visible:outline-2 ${
                selected ? 'border-[var(--color-text-primary)]' : 'border-transparent'
              }`}
              style={{ boxShadow: '0 0 0 1px var(--border-hairline)' }}
            >
              <span aria-hidden="true" className="h-full w-1/2" style={{ backgroundColor: p.primary }} />
              <span aria-hidden="true" className="h-full w-1/2" style={{ backgroundColor: p.accent }} />
            </button>
          );
        })}
      </div>
      <p className="text-xs text-gray-700">{t('colour_presets.hint')}</p>
    </fieldset>
  );
}
