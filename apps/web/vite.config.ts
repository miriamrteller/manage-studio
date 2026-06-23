import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
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
      { find: /^npm:zod(@.*)?$/, replacement: 'zod' },
      // The Deno Stripe SDK import is unresolvable in Node; stub it for factory tests.
      {
        find: /^https:\/\/esm\.sh\/stripe@.*/,
        replacement: path.resolve(__dirname, './src/test/stripe-esm-stub.ts'),
      },
    ],
  },
  build: {
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
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
