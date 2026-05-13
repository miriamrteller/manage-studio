/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: 'var(--primary)',
        accent: 'var(--accent)',
      },
    },
  },
  plugins: [
    // require('tailwindcss-rtl'), // TODO: Fix compatibility with Tailwind 3.3.6
  ],
}
