/**
 * The single fake client instance for the demo build, plus a fetch shim for
 * the few places that call Edge Functions with fetch() directly.
 */
import { FakeSupabaseClient, type Row } from './fakeSupabase';
import { baseFunctions } from './functions';
import { baseRpcs } from './rpcs';
import { ADMIN_EMAIL, ADMIN_USER_ID, buildSeed, CLIENT_USER_ID, DEMO_CLIENT } from './seed';
import { extraFunctions, extraRpcs, hooks, recalcQuote } from './extensions';

/**
 * Embedded or private-mode browsers can throw on any storage access. The app
 * reads localStorage during render (language, nav drawer), so fall back to an
 * in-memory Storage when the real one is unusable.
 */
function ensureStorage(name: 'localStorage' | 'sessionStorage') {
  try {
    const s = window[name];
    s.setItem('__demo_probe', '1');
    s.removeItem('__demo_probe');
  } catch {
    const data = new Map<string, string>();
    const memory: Storage = {
      get length() {
        return data.size;
      },
      clear: () => data.clear(),
      getItem: (k) => data.get(k) ?? null,
      key: (i) => [...data.keys()][i] ?? null,
      removeItem: (k) => {
        data.delete(k);
      },
      setItem: (k, v) => {
        data.set(k, String(v));
      },
    };
    try {
      Object.defineProperty(window, name, { value: memory, configurable: true });
    } catch {
      // Nothing more we can do; the app's own guards apply.
    }
  }
}
ensureStorage('localStorage');
ensureStorage('sessionStorage');

export const DEMO_FUNCTIONS_BASE = 'https://demo.supabase.invalid/functions/v1/';

export const demoClient = new FakeSupabaseClient({
  tables: buildSeed(),
  rpcs: { ...baseRpcs, ...extraRpcs },
  functions: { ...baseFunctions, ...extraFunctions },
  hooks,
  debug: new URLSearchParams(window.location.search).has('demo-debug'),
});

// Fill quote totals with the same rules the SQL trigger uses.
for (const q of demoClient.db.quotes ?? []) recalcQuote(demoClient.ctx(), q);

export type DemoView = 'admin' | 'client' | 'signed-out';

export function signInAs(view: DemoView) {
  if (view === 'admin') demoClient.setUser({ id: ADMIN_USER_ID, email: ADMIN_EMAIL });
  else if (view === 'client') demoClient.setUser({ id: CLIENT_USER_ID, email: DEMO_CLIENT.email });
  else demoClient.setUser(null);
}

export function currentView(): DemoView {
  if (!demoClient.user) return 'signed-out';
  return demoClient.user.id === ADMIN_USER_ID ? 'admin' : 'client';
}

// Start signed in as the photographer.
signInAs('admin');

const realFetch = window.fetch.bind(window);
window.fetch = async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith(DEMO_FUNCTIONS_BASE)) {
    const name = url.slice(DEMO_FUNCTIONS_BASE.length).split('?')[0];
    const headers = new Headers(init?.headers);
    let body: Row = {};
    try {
      body = init?.body ? (JSON.parse(String(init.body)) as Row) : {};
    } catch {
      body = {};
    }
    const res = await demoClient.invokeRaw(name, { ...body, __authorization: headers.get('Authorization') });
    return new Response(JSON.stringify(res.data ?? {}), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return realFetch(input, init);
};
