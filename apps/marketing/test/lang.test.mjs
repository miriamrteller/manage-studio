// The marketing site's language: English by default, Hebrew when the browser's first language
// is Hebrew, and a language picked with the button wins on every page. Covers the shared
// top bar (topbar.js, every page but the home page) and the home page's own script.
// Run: pnpm -C apps/marketing test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const pub = new URL('../public/', import.meta.url);
const topbar = readFileSync(new URL('topbar.js', pub), 'utf8');
const home = readFileSync(new URL('index.html', pub), 'utf8');
const homeScript = home.slice(home.lastIndexOf('<script>') + 8, home.lastIndexOf('</script>'));

function browser({ languages, store = {} }) {
  const el = () => ({ classList: { toggle() {} }, setAttribute() {}, innerHTML: '' });
  const html = { lang: 'he', dir: 'rtl' };
  const ctx = {
    navigator: { languages, language: languages[0] },
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    document: {
      readyState: 'complete',
      documentElement: html,
      body: { dir: 'rtl', lang: 'he' },
      head: { appendChild() {} },
      getElementById: () => el(),
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => el(),
      addEventListener() {},
    },
    location: { pathname: '/photographer.html' },
  };
  ctx.window = ctx;
  return { ctx, html, store };
}

for (const [name, src] of [['top bar', topbar], ['home page', homeScript]]) {
  const run = (opts) => {
    const b = browser(opts);
    vm.runInNewContext(src, b.ctx);
    return b;
  };

  test(`${name}: English unless the browser's first language is Hebrew`, () => {
    assert.equal(run({ languages: ['en-US'] }).html.lang, 'en');
    assert.equal(run({ languages: ['fr-FR', 'he-IL'] }).html.lang, 'en');
    assert.equal(run({ languages: ['en-IL', 'he'] }).html.lang, 'en');
    const he = run({ languages: ['he-IL', 'en'] }).html;
    assert.equal(he.lang, 'he');
    assert.equal(he.dir, 'rtl');
    assert.equal(run({ languages: ['iw'] }).html.lang, 'he');
    assert.equal(run({ languages: [] }).html.dir, 'ltr');
  });

  test(`${name}: the detected language is not saved; old auto-saved values are dropped`, () => {
    const b = run({ languages: ['en-US'], store: { os_lang: 'he', 'os-lang': 'he' } });
    assert.equal(b.html.lang, 'en');
    assert.deepEqual(b.store, {});
  });

  test(`${name}: the language button's choice is kept and wins`, () => {
    const b = run({ languages: ['en-US'] });
    b.ctx.setLang('he', true);
    assert.equal(b.html.lang, 'he');
    assert.equal(b.store.os_lang_choice, 'he');
    assert.equal(run({ languages: ['en-US'], store: { ...b.store } }).html.lang, 'he');
    assert.equal(run({ languages: ['he-IL'], store: { os_lang_choice: 'en' } }).html.lang, 'en');
  });
}

test('the top bar buttons remember the choice', () => {
  assert.match(topbar, /setLang\(\\'he\\', true\)/);
  assert.match(topbar, /setLang\(\\'en\\', true\)/);
});
