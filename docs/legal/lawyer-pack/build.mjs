#!/usr/bin/env node
/**
 * Builds docs/legal/lawyer-pack/OpalSwift-lawyer-pack.pdf (and .docx):
 * one file the owner sends to the lawyer. Cover, table of contents with
 * page numbers, then every document in English and Hebrew.
 *
 *   node docs/legal/lawyer-pack/build.mjs          (from the repo root)
 *
 * Needs: the repo's node_modules (marked, @fontsource/heebo), the Playwright
 * Chromium that CI and the sandbox already have, python3 + pypdf (page
 * counting), and pandoc (the .docx; skipped if missing).
 */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const legal = path.resolve(root, 'docs/legal');
const webRequire = createRequire(path.resolve(root, 'apps/web/package.json'));
const { marked } = webRequire('marked');
const { chromium } = createRequire(import.meta.url)('playwright');

const OUT_PDF = path.join(here, 'OpalSwift-lawyer-pack.pdf');
const OUT_DOCX = path.join(here, 'OpalSwift-lawyer-pack.docx');
const work = path.join(process.env.LAWYER_PACK_WORK ?? tmpdir(), 'lawyer-pack-build');

// Only ONE current pack may exist: remove every PDF/DOCX already in this
// folder (older, renamed or versioned copies) and the previous work files
// before building, so nothing stale can linger next to the new pack.
for (const name of readdirSync(here)) {
  if (/\.(pdf|docx)$/i.test(name)) rmSync(path.join(here, name));
}
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

const buildDate = new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// What goes in, in order. Each document: English first, then Hebrew.
// ---------------------------------------------------------------------------
const DOCS = [
  { n: 1, title: 'Platform terms (OpalSwift ↔ studio)', he: 'תנאי שימוש בפלטפורמה', base: '01-platform-terms' },
  { n: 2, title: 'OpalSwift privacy policy', he: 'מדיניות הפרטיות של OpalSwift', base: '04-opalswift-privacy-policy' },
  { n: 3, title: 'Data processing agreement (DPA)', he: 'הסכם עיבוד מידע', base: '02-dpa' },
  { n: 4, title: 'Class/course enrolment terms (studio template)', he: 'תנאי הרשמה לחוגים ולקורסים', base: '07a-dance-enrolment-terms' },
  { n: 5, title: 'Health declaration, child (studio template)', he: 'הצהרת בריאות — ילדים', base: '07b-health-declaration-child' },
  { n: 6, title: 'Health declaration, adult (studio template)', he: 'הצהרת בריאות — בגירים', base: '07b-health-declaration-adult' },
  { n: 7, title: 'Marketing consent and unsubscribe', he: 'הסכמה לדיוור והסרה', single: '08-marketing-consent.md' },
  { n: 8, title: 'In-app consent texts (incl. photo consent)', he: 'נוסחי הסכמה באפליקציה', single: '09-in-app-consent-texts.md' },
  { n: 9, title: 'Service agreement, base (studio template)', he: 'הסכם למתן שירות', base: '07c-service-agreement' },
  { n: 10, title: 'Add-on: photography', he: 'תוספת: צילום', base: '07c-addon-photographer' },
  { n: 11, title: 'Add-on: beauty and treatments', he: 'תוספת: טיפולי יופי', base: '07c-addon-beautician' },
  { n: 12, title: 'Add-on: coaching and tutoring', he: 'תוספת: אימון והוראה', base: '07c-addon-coaching' },
  { n: 13, title: 'Accessibility statement (OpalSwift)', he: 'הצהרת נגישות', base: '06-accessibility-statement.opalswift' },
  { n: 14, title: 'Beta launch: legal checklist', he: 'רשימת בדיקה להשקת הבטא', checklist: true },
];

// ---------------------------------------------------------------------------
// Markdown → HTML
// ---------------------------------------------------------------------------
function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Drop the drafting frame (leading blockquote), neutralise repo links, mark placeholders. */
function prepare(md) {
  const lines = md.split('\n');
  let i = 0;
  while (i < lines.length && (lines[i].startsWith('>') || lines[i].trim() === '')) i += 1;
  let text = lines.slice(i).join('\n');
  // [label](something.md) → label ; [label](x.md#y) too. http links stay.
  text = text.replace(/\[([^\]]+)\]\((?!https?:)[^)]*\.md(?:#[^)]*)?\)/g, '$1');
  // Owner/studio fill-ins stand out for the lawyer.
  text = text.replace(/\[\[([^\]]*)\]\]/g, (_m, inner) => `<mark>[[${esc(inner)}]]</mark>`);
  return text;
}

function render(md) {
  return marked.parse(prepare(md), { gfm: true, breaks: false });
}

function read(name) {
  return readFileSync(path.join(legal, name), 'utf8');
}

function sectionFromMarkdown(md, heading) {
  const start = md.indexOf(`\n## ${heading}`);
  if (start < 0) throw new Error(`section not found: ${heading}`);
  const rest = md.slice(start + 1);
  const next = rest.indexOf('\n## ', 1);
  return next < 0 ? rest : rest.slice(0, next);
}

function openQuestions() {
  const md = read('OPEN-QUESTIONS.md');
  const sec = sectionFromMarkdown(md, 'Still open: needs a decision');
  return sec.split('\n').filter((l) => /^\d+\.\s/.test(l)).map((l) => l.replace(/^\d+\.\s*/, ''));
}

function betaChecklist() {
  return sectionFromMarkdown(read('LAWYER-PACK.md'), 'Beta launch: legal checklist').replace(/^## .*\n/, '');
}

// Parts: cover and TOC are generated; every other part is one rendered file.
function buildParts() {
  const parts = [];
  for (const d of DOCS) {
    if (d.base) {
      parts.push({ id: `${d.n}-en`, n: d.n, lang: 'en', title: d.title, titleHe: d.he, html: render(read(`${d.base}.en.md`)) });
      parts.push({ id: `${d.n}-he`, n: d.n, lang: 'he', title: d.title, titleHe: d.he, html: render(read(`${d.base}.he.md`)) });
    } else if (d.single) {
      parts.push({ id: `${d.n}-bi`, n: d.n, lang: 'bi', title: d.title, titleHe: d.he, html: render(read(d.single)) });
    } else if (d.checklist) {
      parts.push({ id: `${d.n}-en`, n: d.n, lang: 'en', title: d.title, titleHe: d.he, html: render(betaChecklist()) });
    }
  }
  return parts;
}

function partHtml(p) {
  const dir = p.lang === 'he' ? 'rtl' : 'ltr';
  const langLabel = p.lang === 'he' ? 'עברית' : p.lang === 'bi' ? 'English + עברית' : 'English';
  const headLine = p.lang === 'he' ? `${p.n}. ${p.titleHe} — ${p.title}` : `${p.n}. ${p.title} — ${p.titleHe}`;
  // Bilingual files get per-block direction from the browser.
  const bidi = p.lang === 'bi' ? ' class="doc bidi"' : ' class="doc"';
  return `<section${bidi} dir="${dir}" lang="${p.lang === 'he' ? 'he' : 'en'}" id="p-${p.id}">
<div class="part-head"><span class="part-no">${headLine}</span><span class="part-lang">${langLabel}</span></div>
${p.html}
</section>`;
}

function coverHtml() {
  const qs = openQuestions();
  return `<section class="cover" dir="ltr" lang="en">
<h1>OpalSwift — Lawyer pack<br><span class="he">חבילה לעורך/ת הדין</span></h1>
<p class="meta">Built ${buildDate} from the <code>docs/legal</code> folder of the OpalSwift repository.</p>
<p class="warn"><strong>All documents are drafts, not legal advice.</strong> Each appears in English and then in Hebrew. Hebrew is what users read; <strong>the English version prevails</strong> (owner decision). Yellow <mark>[[…]]</mark> marks are fill-ins the owner or the studio completes.</p>
<h2>What OpalSwift is</h2>
<p>A web app for small studios in Israel (a ballet school first, then a photographer): client and student records, classes and bookings, enrolment, forms and health declarations, contracts, payment requests through third-party providers, messages, and galleries. The studio is the controller of its clients' data; OpalSwift is the holder (מחזיק). OpalSwift runs as a <strong>free beta</strong> and is not yet a registered business; it will register before any paid service.</p>
<h2>What we ask you to check</h2>
<ol>
<li>Platform terms §9 and the beta notice: which of "as is / as available", the liability cap and the exclusions hold under the Standard Contracts Law, and whether an unregistered individual running a studio could claim consumer protection.</li>
<li>DPA: does it meet Amendment 13 and regulation 15 of the Data Security Regulations, and do the sub-processors' DPAs satisfy the Privacy Protection Authority's 13 April 2026 opinion on transfers abroad?</li>
<li>Studio templates (enrolment terms, health declarations, service agreement and its add-ons): cancellation and refund rules against the Consumer Protection Law; the health declaration without a liability release; children's data and photo consent; retention periods.</li>
<li>Marketing consent and the in-app texts: Communications Law §30A; the level of the typed-name e-signature.</li>
<li>The English-prevails clause against Hebrew-reading parents and clients.</li>
</ol>
<h2>Open questions</h2>
<ol>
${qs.map((q) => `<li>${marked.parseInline(q)}</li>`).join('\n')}
</ol>
<p class="meta">Please answer in writing per question number. Sources are listed at the end of each document; anything unconfirmed says "verify". No case law is cited.</p>
</section>`;
}

function tocHtml(entries) {
  const rows = entries
    .map((e) => `<tr><td class="toc-no">${e.n}</td><td>${e.label}</td><td class="toc-lang">${e.lang}</td><td class="toc-page">${e.page ?? ''}</td></tr>`)
    .join('\n');
  return `<section class="toc" dir="ltr" lang="en">
<h1>Contents <span class="he">תוכן</span></h1>
<table class="toc-table"><thead><tr><th></th><th>Document</th><th>Language</th><th>Page</th></tr></thead><tbody>
${rows}
</tbody></table>
</section>`;
}

// ---------------------------------------------------------------------------
// Page styling
// ---------------------------------------------------------------------------
const fontDir = path.resolve(root, 'apps/web/node_modules/@fontsource/heebo/files');
const font = (f) => pathToFileURL(path.join(fontDir, f)).href;
const CSS = `
@font-face { font-family: Heebo; font-weight: 400; src: url("${font('heebo-latin-400-normal.woff2')}") format("woff2"); unicode-range: U+0000-00FF, U+2000-206F, U+20AA; }
@font-face { font-family: Heebo; font-weight: 700; src: url("${font('heebo-latin-700-normal.woff2')}") format("woff2"); unicode-range: U+0000-00FF, U+2000-206F, U+20AA; }
@font-face { font-family: Heebo; font-weight: 400; src: url("${font('heebo-hebrew-400-normal.woff2')}") format("woff2"); unicode-range: U+0590-05FF, U+FB1D-FB4F; }
@font-face { font-family: Heebo; font-weight: 700; src: url("${font('heebo-hebrew-700-normal.woff2')}") format("woff2"); unicode-range: U+0590-05FF, U+FB1D-FB4F; }
@page { size: A4; margin: 0; }
html, body { margin: 0; padding: 0; }
body { font-family: Heebo, "DejaVu Sans", sans-serif; font-size: 10.5pt; line-height: 1.45; color: #111; }
section { page-break-before: always; break-before: page; padding: 0; }
section:first-child { page-break-before: auto; }
h1 { font-size: 20pt; margin: 0 0 10pt; line-height: 1.25; }
h2 { font-size: 14pt; margin: 16pt 0 6pt; page-break-after: avoid; }
h3 { font-size: 11.5pt; margin: 12pt 0 4pt; page-break-after: avoid; }
p, li { orphans: 3; widows: 3; }
ul, ol { padding-inline-start: 1.4em; }
table { border-collapse: collapse; width: 100%; margin: 6pt 0 10pt; font-size: 9.5pt; page-break-inside: auto; }
th, td { border: 0.5pt solid #999; padding: 3pt 5pt; vertical-align: top; text-align: start; }
th { background: #f0f0f0; }
tr { page-break-inside: avoid; }
code { font-family: "DejaVu Sans Mono", monospace; font-size: 9pt; }
mark { background: #fff3a3; padding: 0 2px; }
hr { border: 0; border-top: 0.5pt solid #bbb; margin: 12pt 0; }
a { color: #1a4d8f; text-decoration: none; }
[dir="rtl"] { text-align: right; }
.bidi p, .bidi li, .bidi h1, .bidi h2, .bidi h3, .bidi td, .bidi th { unicode-bidi: plaintext; }
.part-head { display: flex; justify-content: space-between; border-bottom: 1.5pt solid #333; margin-bottom: 10pt; padding-bottom: 4pt; font-size: 9.5pt; color: #444; }
[dir="rtl"] .part-head { flex-direction: row; }
.part-no { font-weight: 700; }
.cover h1 { font-size: 26pt; margin-top: 40pt; }
.cover .he { font-size: 18pt; font-weight: 400; color: #333; }
.cover .warn { border: 1pt solid #c9a200; background: #fffbe6; padding: 8pt 10pt; }
.meta { color: #555; font-size: 9.5pt; }
.toc h1 .he { font-size: 14pt; font-weight: 400; color: #333; margin-inline-start: 10pt; }
.toc-table td, .toc-table th { border: 0; border-bottom: 0.5pt solid #ddd; }
.toc-no { width: 2em; color: #666; }
.toc-lang { width: 9em; color: #555; }
.toc-page { width: 4em; text-align: right; }
`;

function page(bodyHtml) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>OpalSwift lawyer pack</title><style>${CSS}</style></head><body>${bodyHtml}</body></html>`;
}

const PDF_OPTS = {
  format: 'A4',
  printBackground: true,
  margin: { top: '16mm', bottom: '18mm', left: '16mm', right: '16mm' },
  displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate:
    '<div style="width:100%;font-size:8.5px;color:#666;text-align:center;font-family:\'DejaVu Sans\',sans-serif;">' +
    'OpalSwift lawyer pack · draft, not legal advice · page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
};

function pdfPages(file) {
  const out = execFileSync('python3', ['-c', 'import sys,pypdf;print(len(pypdf.PdfReader(sys.argv[1]).pages))', file]);
  return Number(String(out).trim());
}

function pdfPageText(file, pageNo) {
  const out = execFileSync('python3', [
    '-c',
    'import sys,pypdf;print(pypdf.PdfReader(sys.argv[1]).pages[int(sys.argv[2])-1].extract_text() or "")',
    file,
    String(pageNo),
  ]);
  return String(out);
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------
const parts = buildParts();
const browser = await chromium.launch();
const pg = await browser.newPage();

async function toPdf(html, file) {
  const htmlFile = path.join(work, path.basename(file).replace(/\.pdf$/, '.html'));
  writeFileSync(htmlFile, html);
  await pg.goto(pathToFileURL(htmlFile).href, { waitUntil: 'load' });
  await pg.evaluate(() => document.fonts.ready);
  await pg.pdf({ ...PDF_OPTS, path: file });
  return file;
}

// Pass 1: page counts. Every part starts on a new page, so standalone counts
// equal the counts inside the combined file.
const counts = new Map();
for (const p of parts) {
  const f = await toPdf(page(partHtml(p)), path.join(work, `part-${p.id}.pdf`));
  counts.set(p.id, pdfPages(f));
}
const coverPages = pdfPages(await toPdf(page(coverHtml()), path.join(work, 'cover.pdf')));
const langName = (l) => (l === 'he' ? 'עברית' : l === 'bi' ? 'English + עברית' : 'English');
const tocEntries = parts.map((p) => ({ n: p.n, label: p.lang === 'he' ? `${p.titleHe} — ${p.title}` : p.title, lang: langName(p.lang) }));
const tocPages = pdfPages(await toPdf(page(tocHtml(tocEntries)), path.join(work, 'toc.pdf')));

let pageNo = coverPages + tocPages + 1;
parts.forEach((p, i) => {
  tocEntries[i].page = pageNo;
  p.startPage = pageNo;
  pageNo += counts.get(p.id);
});
const totalPages = pageNo - 1;

// Pass 2: the real file, with page numbers in the contents.
const full = page(coverHtml() + tocHtml(tocEntries) + parts.map(partHtml).join('\n'));
await toPdf(full, OUT_PDF);
await browser.close();

// Verify: page count, and that every part starts where the contents say.
// Text extraction reorders right-to-left lines, so the check uses the
// English part of each heading, which every part head carries.
const got = pdfPages(OUT_PDF);
if (got !== totalPages) throw new Error(`page count mismatch: expected ${totalPages}, got ${got}`);
for (const p of parts) {
  const text = pdfPageText(OUT_PDF, p.startPage).replace(/\s+/g, ' ');
  const needle = p.title.split(' (')[0].split(' —')[0].split(':')[0];
  if (!text.includes(needle)) {
    throw new Error(`part ${p.id} not found on page ${p.startPage} (looked for "${needle}")`);
  }
}
console.log(`PDF: ${path.relative(root, OUT_PDF)} (${totalPages} pages)`);

// ---------------------------------------------------------------------------
// DOCX via pandoc (optional). Hebrew parts are wrapped in dir=rtl divs.
// ---------------------------------------------------------------------------
try {
  execFileSync('pandoc', ['--version'], { stdio: 'ignore' });
  const md = [];
  md.push(`# OpalSwift — Lawyer pack / חבילה לעורך/ת הדין\n\nBuilt ${buildDate}. **All documents are drafts, not legal advice.** English first, then Hebrew; the English version prevails. \`[[…]]\` marks fill-ins.\n`);
  md.push(`## Open questions\n\n${openQuestions().map((q, i) => `${i + 1}. ${q}`).join('\n')}\n`);
  for (const d of DOCS) {
    if (d.base) {
      md.push(`\n# ${d.n}. ${d.title} (English)\n\n${prepare(read(`${d.base}.en.md`)).replace(/^# /m, '## ')}\n`);
      md.push(`\n# ${d.n}. ${d.he} (עברית)\n\n::: {dir=rtl}\n${prepare(read(`${d.base}.he.md`)).replace(/^# /m, '## ')}\n:::\n`);
    } else if (d.single) {
      md.push(`\n# ${d.n}. ${d.title}\n\n${prepare(read(d.single)).replace(/^# /m, '## ')}\n`);
    } else if (d.checklist) {
      md.push(`\n# ${d.n}. ${d.title}\n\n${betaChecklist()}\n`);
    }
  }
  const mdFile = path.join(work, 'pack.md');
  writeFileSync(mdFile, md.join('\n').replace(/<mark>|<\/mark>/g, '**'));
  execFileSync('pandoc', [mdFile, '-f', 'markdown+pipe_tables+fenced_divs+raw_html', '-t', 'docx', '--toc', '--toc-depth=1', '-o', OUT_DOCX]);
  console.log(`DOCX: ${path.relative(root, OUT_DOCX)}`);
} catch (err) {
  console.warn(`DOCX skipped: ${err.message}`);
}
