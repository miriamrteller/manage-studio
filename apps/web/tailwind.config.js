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
        secondary: 'var(--color-secondary)',
        accent: 'var(--color-primary)',
        error: 'var(--color-error)',
        warning: 'var(--color-warning)',
        success: 'var(--color-success)',
        info: 'var(--color-info)',
      },
    },
  },
  plugins: [
    // require('tailwindcss-rtl'), // TODO: Fix compatibility with Tailwind 3.3.6
  ],
}
