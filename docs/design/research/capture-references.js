/**
 * Capture the two design references (Light Blue, OpalSwift) once their hosts
 * are allowed in the session's network settings. Not run in this PR: both
 * hosts were denied by the environment's network policy (see the proposal).
 *
 *   NODE_PATH=$(npm root -g) node docs/design/research/capture-references.js
 *
 * Writes full-page screenshots at 1280 and 390 plus a JSON dump of computed
 * tokens (colours, gradients, fonts, radii, shadows) to docs/design/research/refs/.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'refs');
const TARGETS = {
  lightblue: [
    'https://www.lightbluesoftware.com/',
    'https://www.lightbluesoftware.com/features/',
    'https://www.lightbluesoftware.com/tour/',
  ],
  opalswift: ['https://opalswift.com/'],
};

function extractTokens() {
  const counts = (map, v) => { if (v && v !== 'none' && v !== 'normal') map[v] = (map[v] || 0) + 1; };
  const bg = {}, fg = {}, border = {}, gradients = {}, fonts = {}, sizes = {}, radii = {}, shadows = {}, filters = {}, transitions = {};
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    counts(bg, cs.backgroundColor === 'rgba(0, 0, 0, 0)' ? null : cs.backgroundColor);
    counts(fg, cs.color);
    if (cs.borderTopWidth !== '0px') counts(border, `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`);
    if (cs.backgroundImage.includes('gradient')) counts(gradients, `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 2).join('.')} → ${cs.backgroundImage}`);
    counts(fonts, `${cs.fontFamily} ${cs.fontWeight}`);
    counts(sizes, `${cs.fontSize}/${cs.lineHeight}`);
    counts(radii, cs.borderRadius === '0px' ? null : cs.borderRadius);
    counts(shadows, cs.boxShadow);
    counts(filters, cs.backdropFilter);
    counts(transitions, cs.transition === 'all 0s ease 0s' ? null : cs.transition);
  }
  const top = (m, n = 25) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n);
  const rootVars = [...document.styleSheets].flatMap((s) => { try { return [...s.cssRules]; } catch { return []; } })
    .filter((r) => r.selectorText === ':root').map((r) => r.cssText);
  return {
    url: location.href,
    background: top(bg), text: top(fg), borders: top(border), gradients: top(gradients, 60),
    fonts: top(fonts), fontSizes: top(sizes), radii: top(radii), shadows: top(shadows),
    backdropFilters: top(filters), transitions: top(transitions), rootCustomProperties: rootVars,
  };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  for (const [site, urls] of Object.entries(TARGETS)) {
    for (const [i, url] of urls.entries()) {
      for (const [w, h] of [[1280, 800], [390, 844]]) {
        const page = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage();
        try {
          await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
          await page.waitForTimeout(1500);
          const name = `${site}-${i}-${w}`;
          await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
          if (w === 1280) fs.writeFileSync(path.join(OUT, `${site}-${i}-tokens.json`), JSON.stringify(await page.evaluate(extractTokens), null, 1));
          console.log('ok', name);
        } catch (e) {
          console.log('FAILED', url, w, e.message.split('\n')[0]);
        }
        await page.context().close();
      }
    }
  }
  await browser.close();
})();
