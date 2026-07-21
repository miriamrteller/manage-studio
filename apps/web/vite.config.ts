import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

/** Map Deno `npm:` specifiers in edge-function imports to Node packages for Vitest. */
function denoNpmImportMap() {
  const zodEntry = path.resolve(__dirname, 'node_modules/zod/index.js');
  return {
    name: 'deno-npm-import-map',
    resolveId(source: string) {
      if (source === 'npm:zod@3.22.4' || /^npm:zod@/.test(source)) {
        return zodEntry;
      }
      if (source === 'zod') {
        return zodEntry;
      }
      return null;
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), denoNpmImportMap()],
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
      VITE_SUPABASE_ANON_KEY: 'placeholder-anon-key',
    },
  },
})
