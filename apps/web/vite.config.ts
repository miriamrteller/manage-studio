import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

/** Map Deno `npm:` specifiers in edge-function imports to Node packages for Vitest. */
function denoNpmImportMap() {
  const zodEntry = path.resolve(__dirname, 'node_modules/zod/index.js');
  const hebcalEntry = path.resolve(__dirname, 'node_modules/@hebcal/core/dist/esm/index.js');
  return {
    name: 'deno-npm-import-map',
    resolveId(source: string) {
      if (source === 'npm:zod@3.22.4' || /^npm:zod@/.test(source)) {
        return zodEntry;
      }
      if (source === 'zod') {
        return zodEntry;
      }
      // supabase/functions/_shared/holidays.ts imports npm:@hebcal/core@^6.6.0. That
      // file lives outside apps/web, so bare-specifier resolution (walking up from the
      // importer's directory) never reaches apps/web/node_modules under pnpm's strict,
      // non-hoisted layout. Resolve to an absolute path, same as the zod entry above.
      if (source === '@hebcal/core' || /^npm:@hebcal\/core(@.*)?$/.test(source)) {
        return hebcalEntry;
      }
      return null;
    },
  };
}

/**
 * VITE_DEMO_MODE=true builds a browser-only demo (no Supabase): app imports of
 * src/lib/supabase.ts and resolveTenantSubdomain.ts are swapped for the
 * in-memory versions in src/demo/, routing uses a hash router, and the entry
 * becomes src/demo/main.tsx. Without the flag none of src/demo is reachable,
 * so the production bundle is unchanged.
 */
const DEMO_MODE = process.env.VITE_DEMO_MODE === 'true';

function demoMode() {
  const src = path.resolve(__dirname, 'src');
  const swaps: Record<string, string> = {
    [path.join(src, 'lib/supabase.ts')]: path.join(src, 'demo/supabase.ts'),
    [path.join(src, 'lib/resolveTenantSubdomain.ts')]: path.join(src, 'demo/resolveTenantSubdomain.ts'),
    // Until the photographer ClientPortal is on main: an adult client page
    // without the class-school parts (children, class registration).
    [path.join(src, 'pages/PortalDashboard.tsx')]: path.join(src, 'demo/DemoClientPortal.tsx'),
  };
  const routerShim = path.join(src, 'demo/reactRouterDom.ts');
  const stripeStub = path.join(src, 'demo/stripeStub.ts');
  return {
    name: 'demo-mode',
    enforce: 'pre' as const,
    async resolveId(
      this: { resolve: (s: string, i?: string, o?: Record<string, unknown>) => Promise<{ id: string } | null> },
      source: string,
      importer: string | undefined,
      options: Record<string, unknown>,
    ) {
      if (source === 'react-router-dom' && importer && importer !== routerShim) return routerShim;
      // Stripe.js loads from js.stripe.com; the demo makes no external requests.
      if (source === '@stripe/stripe-js') return stripeStub;
      if (!importer || !/(^|\/)(supabase|resolveTenantSubdomain|PortalDashboard)$/.test(source)) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (resolved && swaps[resolved.id] && !importer.startsWith(path.join(src, 'demo'))) return swaps[resolved.id];
      return null;
    },
    // Full-page navigations and absolute links to app paths would leave the
    // artifact; route them through the hash router instead.
    transform(code: string, id: string) {
      if (!id.startsWith(src) || id.startsWith(path.join(src, 'demo'))) return null;
      if (!code.includes('window.location.href = ') && !code.includes('window.location.origin')) return null;
      return code
        .replace(/window\.location\.href = (['"`])\//g, 'window.location.hash = $1#/')
        // Absolute app links (pay links, quote links) become hash links on the current page.
        .replace(/window\.location\.origin/g, "(window.location.href.split('#')[0] + '#')");
    },
    transformIndexHtml: {
      // 'pre' so the entry script is swapped before Vite collects it.
      order: 'pre' as const,
      handler(html: string) {
        return html
          .replace('/src/main.tsx', '/src/demo/main.tsx')
          .replace(/<title>.*<\/title>/, '<title>Lumen &amp; Light Photography (demo)</title>')
          .replace(/\s*<link rel="icon"[^>]*>/, '');
      },
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), denoNpmImportMap(), ...(DEMO_MODE ? [demoMode()] : [])],
  ...(DEMO_MODE
    ? {
        base: './',
        define: {
          'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://demo.supabase.invalid'),
          'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('demo'),
        },
      }
    : {}),
  server: {
    host: '0.0.0.0',
  },
  resolve: {
    alias: [
      { find: '@shared', replacement: path.resolve(__dirname, '../../packages/shared/src') },
      { find: '@', replacement: path.resolve(__dirname, './src') },
      // Mirror the edge-function import map ("shared/email") so tests that import
      // _shared modules can resolve the email renderer from source.
      {
        find: 'shared/email',
        replacement: path.resolve(__dirname, '../../packages/shared/src/email/render-template.ts'),
      },
      // Edge functions use Deno-style specifiers; map them to node packages for Vitest.
      { find: 'npm:zod@3.22.4', replacement: 'zod' },
      { find: /^npm:zod(@.*)?$/, replacement: 'zod' },
      // npm:@hebcal/core is handled by the denoNpmImportMap() plugin above (it needs
      // to resolve to an absolute path, not a bare specifier — see that plugin for why).
      // The Deno Stripe SDK import is unresolvable in Node; stub it for factory tests.
      {
        find: /^https:\/\/esm\.sh\/stripe@.*/,
        replacement: path.resolve(__dirname, './src/test/stripe-esm-stub.ts'),
      },
    ],
  },
  build: {
    // SPEC §7 — do not ship source maps to production clients
    sourcemap: false,
    ...(DEMO_MODE ? { outDir: 'dist-demo' } : {}),
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'query-vendor': ['@tanstack/react-query', '@tanstack/react-query-devtools'],
          'table-vendor': ['@tanstack/react-table'],
          'calendar-vendor': [
            '@fullcalendar/core',
            '@fullcalendar/daygrid',
            '@fullcalendar/interaction',
            '@fullcalendar/react',
            '@fullcalendar/timegrid',
          ],
          'charts-vendor': ['recharts'],
          'stripe-vendor': ['@stripe/react-stripe-js', '@stripe/stripe-js'],
          'form-vendor': ['react-hook-form', '@hookform/resolvers', 'zod'],
          'i18n-vendor': ['i18next', 'react-i18next'],
          'ui-vendor': ['lucide-react'],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./src/test/setup.ts'],
    // Parallel workers OOM on Windows when transforming edge-function graphs.
    threads: false,
    // Provide placeholder Supabase config so modules that read import.meta.env
    // at init time don't throw in the CI/Vitest environment.
    env: {
      VITE_SUPABASE_URL: 'https://placeholder.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'placeholder-anon-key',
    },
  },
})
