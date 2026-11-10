// Search and link-preview tags: every page in seo-source.mjs has its generated block
// (title and description in both languages), the sitemap lists every page, and
// robots.txt points to it. Run: pnpm -C apps/marketing test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { PAGES, SITE, SHARE_IMAGE } from '../scripts/seo-source.mjs';
import { START, END, headBlock, applyHead, sitemap, pageUrl } from '../scripts/build-seo.mjs';

const pub = new URL('../public/', import.meta.url);
const read = (f) => readFileSync(new URL(f, pub), 'utf8');
const htmlFiles = readdirSync(pub).filter((f) => f.endsWith('.html'));

test('each page carries its current SEO block, once, with one <title>', () => {
  for (const [file, page] of Object.entries(PAGES)) {
    const html = read(file);
    assert.ok(html.includes(headBlock(file, page)), `${file}: out of date, run npm run build:seo`);
    assert.equal(html.split(START).length, 2, `${file}: one seo block`);
    assert.equal((html.match(/<title/g) || []).length, 1, `${file}: one <title>`);
    assert.ok(html.indexOf(END) < html.indexOf('</head>'), `${file}: block inside <head>`);
  }
});

test('titles and descriptions exist in both languages and stay a sensible length', () => {
  for (const [file, { title, description }] of Object.entries(PAGES)) {
    for (const lang of ['en', 'he']) {
      assert.ok(title[lang] && title[lang].length <= 75, `${file} title.${lang}`);
      assert.ok(description[lang] && description[lang].length <= 170, `${file} description.${lang}`);
    }
    assert.match(description.he, /[֐-׿]/, `${file}: Hebrew description is Hebrew`);
  }
});

test('every marketing page except the generated legal pages has tags', () => {
  const legal = ['terms.html', 'privacy.html', 'accessibility.html'];
  for (const f of htmlFiles) if (!legal.includes(f)) assert.ok(PAGES[f], `${f} missing from seo-source.mjs`);
});

test('sitemap lists every page at its served address; robots.txt points to it', () => {
  assert.equal(read('sitemap.xml'), sitemap(htmlFiles));
  for (const f of htmlFiles) assert.ok(read('sitemap.xml').includes(`<loc>${pageUrl(f)}</loc>`));
  assert.equal(pageUrl('index.html'), `${SITE}/`);
  assert.equal(pageUrl('photographer.html'), `${SITE}/photographer`);
  assert.match(read('robots.txt'), new RegExp(`^Sitemap: ${SITE}/sitemap\\.xml$`, 'm'));
  assert.ok(existsSync(new URL(SHARE_IMAGE, pub)), 'share image exists');
});

test('applyHead replaces the first <title>, then only the marked block', () => {
  const page = '<head><title>Old</title><meta x></head>';
  const once = applyHead(page, `${START}\nA\n${END}`);
  assert.equal(once, `<head>${START}\nA\n${END}<meta x></head>`);
  assert.equal(applyHead(once, `${START}\nB\n${END}`), `<head>${START}\nB\n${END}<meta x></head>`);
});

test('special characters are escaped in attributes', () => {
  const block = headBlock('x.html', { title: { en: 'A "B" & C', he: 'ד' }, description: { en: '<i>', he: 'ה' } });
  assert.ok(block.includes('data-en="A &quot;B&quot; &amp; C"'));
  assert.ok(block.includes('content="&lt;i&gt;"'));
});
