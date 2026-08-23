/**
 * Self-hosted webfonts for every tenant font pair (FONT_PAIRS in
 * hooks/useFontLoader.ts). These replace the former runtime
 * fonts.googleapis.com <link> injection, which silently degraded to system
 * fallback fonts whenever the request failed (ad-blockers, offline dev,
 * firewalled CI) — for Hebrew that often meant a thin serif face with no
 * real bold.
 *
 * Importing all pairs up front costs only CSS bytes: browsers fetch a
 * @font-face file lazily, when rendered text actually matches that family
 * and unicode-range, so only the active pair's weights are downloaded.
 *
 * Only the latin, latin-ext, and hebrew subsets are imported — the app is
 * Hebrew/English. Importing a package's bare `<weight>.css` instead would
 * also bundle cyrillic/greek/vietnamese/devanagari files the app never
 * serves.
 */

/* Reliable: Inter + Heebo. Heebo is also the base stack in index.css and the
 * Hebrew fallback for every other pair, so it must always be bundled. */
import '@fontsource/inter/latin-300.css';
import '@fontsource/inter/latin-ext-300.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-ext-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-ext-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-ext-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/inter/latin-ext-700.css';
import '@fontsource/heebo/latin-300.css';
import '@fontsource/heebo/latin-ext-300.css';
import '@fontsource/heebo/hebrew-300.css';
import '@fontsource/heebo/latin-400.css';
import '@fontsource/heebo/latin-ext-400.css';
import '@fontsource/heebo/hebrew-400.css';
import '@fontsource/heebo/latin-500.css';
import '@fontsource/heebo/latin-ext-500.css';
import '@fontsource/heebo/hebrew-500.css';
import '@fontsource/heebo/latin-600.css';
import '@fontsource/heebo/latin-ext-600.css';
import '@fontsource/heebo/hebrew-600.css';
import '@fontsource/heebo/latin-700.css';
import '@fontsource/heebo/latin-ext-700.css';
import '@fontsource/heebo/hebrew-700.css';

/* Elegant: Crimson Text + Frank Ruhl Libre */
import '@fontsource/crimson-text/latin-400.css';
import '@fontsource/crimson-text/latin-ext-400.css';
import '@fontsource/crimson-text/latin-400-italic.css';
import '@fontsource/crimson-text/latin-ext-400-italic.css';
import '@fontsource/crimson-text/latin-600.css';
import '@fontsource/crimson-text/latin-ext-600.css';
import '@fontsource/frank-ruhl-libre/latin-300.css';
import '@fontsource/frank-ruhl-libre/latin-ext-300.css';
import '@fontsource/frank-ruhl-libre/hebrew-300.css';
import '@fontsource/frank-ruhl-libre/latin-400.css';
import '@fontsource/frank-ruhl-libre/latin-ext-400.css';
import '@fontsource/frank-ruhl-libre/hebrew-400.css';
import '@fontsource/frank-ruhl-libre/latin-500.css';
import '@fontsource/frank-ruhl-libre/latin-ext-500.css';
import '@fontsource/frank-ruhl-libre/hebrew-500.css';
import '@fontsource/frank-ruhl-libre/latin-700.css';
import '@fontsource/frank-ruhl-libre/latin-ext-700.css';
import '@fontsource/frank-ruhl-libre/hebrew-700.css';

/* Dynamic: Poppins + Assistant */
import '@fontsource/poppins/latin-300.css';
import '@fontsource/poppins/latin-ext-300.css';
import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-ext-400.css';
import '@fontsource/poppins/latin-500.css';
import '@fontsource/poppins/latin-ext-500.css';
import '@fontsource/poppins/latin-600.css';
import '@fontsource/poppins/latin-ext-600.css';
import '@fontsource/poppins/latin-700.css';
import '@fontsource/poppins/latin-ext-700.css';
import '@fontsource/assistant/latin-300.css';
import '@fontsource/assistant/latin-ext-300.css';
import '@fontsource/assistant/hebrew-300.css';
import '@fontsource/assistant/latin-400.css';
import '@fontsource/assistant/latin-ext-400.css';
import '@fontsource/assistant/hebrew-400.css';
import '@fontsource/assistant/latin-500.css';
import '@fontsource/assistant/latin-ext-500.css';
import '@fontsource/assistant/hebrew-500.css';
import '@fontsource/assistant/latin-600.css';
import '@fontsource/assistant/latin-ext-600.css';
import '@fontsource/assistant/hebrew-600.css';
import '@fontsource/assistant/latin-700.css';
import '@fontsource/assistant/latin-ext-700.css';
import '@fontsource/assistant/hebrew-700.css';

/* Warm: Source Sans 3 + Rubik */
import '@fontsource/source-sans-3/latin-300.css';
import '@fontsource/source-sans-3/latin-ext-300.css';
import '@fontsource/source-sans-3/latin-400.css';
import '@fontsource/source-sans-3/latin-ext-400.css';
import '@fontsource/source-sans-3/latin-500.css';
import '@fontsource/source-sans-3/latin-ext-500.css';
import '@fontsource/source-sans-3/latin-600.css';
import '@fontsource/source-sans-3/latin-ext-600.css';
import '@fontsource/source-sans-3/latin-700.css';
import '@fontsource/source-sans-3/latin-ext-700.css';
import '@fontsource/rubik/latin-300.css';
import '@fontsource/rubik/latin-ext-300.css';
import '@fontsource/rubik/hebrew-300.css';
import '@fontsource/rubik/latin-400.css';
import '@fontsource/rubik/latin-ext-400.css';
import '@fontsource/rubik/hebrew-400.css';
import '@fontsource/rubik/latin-500.css';
import '@fontsource/rubik/latin-ext-500.css';
import '@fontsource/rubik/hebrew-500.css';
import '@fontsource/rubik/latin-600.css';
import '@fontsource/rubik/latin-ext-600.css';
import '@fontsource/rubik/hebrew-600.css';
import '@fontsource/rubik/latin-700.css';
import '@fontsource/rubik/latin-ext-700.css';
import '@fontsource/rubik/hebrew-700.css';

/* Bold: Oswald + Miriam Libre (Miriam Libre only ships 400/700) */
import '@fontsource/oswald/latin-300.css';
import '@fontsource/oswald/latin-ext-300.css';
import '@fontsource/oswald/latin-400.css';
import '@fontsource/oswald/latin-ext-400.css';
import '@fontsource/oswald/latin-500.css';
import '@fontsource/oswald/latin-ext-500.css';
import '@fontsource/oswald/latin-600.css';
import '@fontsource/oswald/latin-ext-600.css';
import '@fontsource/oswald/latin-700.css';
import '@fontsource/oswald/latin-ext-700.css';
import '@fontsource/miriam-libre/latin-400.css';
import '@fontsource/miriam-libre/latin-ext-400.css';
import '@fontsource/miriam-libre/hebrew-400.css';
import '@fontsource/miriam-libre/latin-700.css';
import '@fontsource/miriam-libre/latin-ext-700.css';
import '@fontsource/miriam-libre/hebrew-700.css';
