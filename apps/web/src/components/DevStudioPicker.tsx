/**
 * Dev website only (see lib/devStudioPicker.ts): the start page that picks a test studio, and
 * the thin bar that says which one is open. English and Hebrew side by side, so it needs no
 * studio language. Never in a live build: main.tsx renders these only when the picker is on.
 */
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { chooseDevStudio, DEV_PLATFORM_CHOICE, devStudioList, readDevStudioChoice } from '../lib/devStudioPicker';

type StudioRow = { subdomain: string; name: string | null; skin: string | null; missing: boolean };

const SKIN_NAMES: Record<string, { en: string; he: string }> = {
  'dance-studio': { en: 'Dance studio', he: 'סטודיו למחול' },
  photographer: { en: 'Photography', he: 'צילום' },
  beautician: { en: 'Beauty', he: 'טיפוח ויופי' },
  generic: { en: 'General', he: 'כללי' },
};

function skinName(skin: string | null): { en: string; he: string } {
  if (!skin) return { en: '', he: '' };
  return SKIN_NAMES[skin] ?? { en: skin, he: skin };
}

async function loadStudio(subdomain: string): Promise<StudioRow> {
  const { data, error } = await supabase.rpc('get_tenant_config_by_subdomain', { p_subdomain: subdomain });
  const row = !error && Array.isArray(data) ? (data[0] as { name?: string; skin?: string } | undefined) : undefined;
  return { subdomain, name: row?.name ?? null, skin: row?.skin ?? null, missing: !row };
}

export function DevStudioPickerPage() {
  const [studios, setStudios] = useState<StudioRow[] | null>(null);

  useEffect(() => {
    let live = true;
    void Promise.all(devStudioList().map(loadStudio)).then((rows) => {
      if (live) setStudios(rows);
    });
    return () => {
      live = false;
    };
  }, []);

  return (
    <main className="mx-auto max-w-xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">OpalSwift dev website</h1>
        <p className="text-2xl font-bold" dir="rtl" lang="he">אתר הפיתוח של OpalSwift</p>
        <p className="text-sm text-gray-700">Test data only. Pick a studio to open it.</p>
        <p className="text-sm text-gray-700" dir="rtl" lang="he">נתוני בדיקה בלבד. בחרו סטודיו כדי לפתוח אותו.</p>
      </header>

      {studios === null ? (
        <p className="text-sm text-gray-700" role="status">Loading… · טוען…</p>
      ) : (
        <ul className="space-y-3">
          {studios.map((s) => {
            const skin = skinName(s.skin);
            return (
              <li key={s.subdomain}>
                <button
                  type="button"
                  disabled={s.missing}
                  onClick={() => chooseDevStudio(s.subdomain)}
                  className="w-full rounded-lg border border-gray-300 p-4 text-start hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="block font-medium">{s.name ?? s.subdomain}</span>
                  {s.missing ? (
                    <span className="block text-sm text-gray-700">
                      Not in the dev database yet · <span dir="rtl" lang="he">עדיין לא קיים במסד הנתונים של הפיתוח</span>
                    </span>
                  ) : (
                    <span className="block text-sm text-gray-700">
                      {skin.en} · <span dir="rtl" lang="he">{skin.he}</span>
                    </span>
                  )}
                </button>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => chooseDevStudio(DEV_PLATFORM_CHOICE)}
              className="w-full rounded-lg border border-dashed border-gray-400 p-4 text-start hover:bg-gray-50"
            >
              <span className="block font-medium">OpalSwift sign-up and welcome pages</span>
              <span className="block text-sm text-gray-700" dir="rtl" lang="he">דפי ההרשמה והפתיחה של OpalSwift</span>
            </button>
          </li>
        </ul>
      )}
    </main>
  );
}

/** Thin bar on every page of the dev website: which studio is open, and a way back to the list. */
export function DevSiteBar() {
  const choice = readDevStudioChoice();
  const label = !choice || choice === DEV_PLATFORM_CHOICE ? 'OpalSwift' : choice;
  return (
    <div className="flex items-center justify-center gap-3 bg-amber-200 px-3 py-1 text-xs text-gray-900">
      <span>
        Dev website, test data · <span dir="rtl" lang="he">אתר פיתוח, נתוני בדיקה</span> · <span dir="ltr">{label}</span>
      </span>
      <button type="button" onClick={() => chooseDevStudio(null)} className="font-medium underline">
        Change studio · <span dir="rtl" lang="he">החלפת סטודיו</span>
      </button>
    </div>
  );
}
