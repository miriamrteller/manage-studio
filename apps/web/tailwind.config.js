/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary)',
        'primary-hover': 'var(--color-primary-hover)',
        'primary-active': 'var(--color-primary-active)',
        secondary: 'var(--color-secondary)',
        'secondary-hover': 'var(--color-secondary-hover)',
        'secondary-active': 'var(--color-secondary-active)',
        'on-primary': 'var(--color-on-primary)',
        'on-secondary': 'var(--color-on-secondary)',
        accent: 'var(--color-secondary)',
        error: 'var(--color-error)',
        warning: 'var(--color-warning)',
        success: 'var(--color-success)',
        info: 'var(--color-info)',
      },
      // NOTE (DL-DESIGN-001): the spec's original plan mapped these onto the
      // *default* Tailwind spacing keys (0-10). This codebase uses stock
      // Tailwind spacing (p-4, px-3, py-2, gap-4, mb-6, ...) in ~1,750 places
      // across the app, so overriding keys 0-10 would silently change nearly
      // every padding/margin/gap value site-wide (e.g. p-4 goes from 1rem to
      // 0.75rem). That is a sweeping visual regression, not a polish. Instead
      // the 8pt-grid tokens are exposed under a non-colliding `sp-*` prefix
      // so new/updated components can opt in without touching existing ones.
      spacing: {
        'sp-0': 'var(--spacing-0)',
        'sp-1': 'var(--spacing-1)',
        'sp-2': 'var(--spacing-2)',
        'sp-3': 'var(--spacing-3)',
        'sp-4': 'var(--spacing-4)',
        'sp-5': 'var(--spacing-5)',
        'sp-6': 'var(--spacing-6)',
        'sp-7': 'var(--spacing-7)',
        'sp-8': 'var(--spacing-8)',
        'sp-9': 'var(--spacing-9)',
        'sp-10': 'var(--spacing-10)',
      },
      fontFamily: {
        sans: ['var(--font-family-sans)'],
        hebrew: ['var(--font-family-hebrew)'],
      },
    },
  },
  plugins: [
    require('tailwindcss-rtl'),
  ],
}
