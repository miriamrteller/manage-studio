const { chromium } = require('playwright');
(async () => {
  const width = Number(process.argv[2] || 390);
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width, height: 900 } });
  const ext = []; p.on('request', r => { const u = r.url(); if (!/^http:\/\/localhost:417[34]|^data:|^blob:/.test(u)) ext.push(u); });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:4174/'); await p.waitForTimeout(2500);
  const fr = () => p.frames().find(x => x !== p.mainFrame());
  const go = async (h) => { await fr().evaluate((x) => { location.hash = x; }, h); await p.waitForTimeout(2500); };
  await go('#/admin/setup/settings?tab=payment');
  const sm = fr().locator('section', { has: fr().getByRole('heading', { name: 'SmugMug' }) });
  await sm.scrollIntoViewIfNeeded();
  console.log('smugmug:', (await sm.innerText()).match(/Connected to SmugMug since[^\n]*/)?.[0]);
  await sm.getByRole('button', { name: 'Test connection' }).click(); await p.waitForTimeout(800);
  console.log('test:', /Connected and working/.test(await sm.innerText()));
  await sm.screenshot({ path: `new-smugmug-${width}.png` });
  await sm.getByRole('button', { name: 'Disconnect' }).click(); await p.waitForTimeout(800);
  const conf = fr().getByRole('button', { name: 'Disconnect' }).last(); if (await conf.isVisible().catch(() => false)) { await conf.click(); await p.waitForTimeout(800); }
  console.log('after disconnect:', /Disconnected\./.test(await sm.innerText()), /Connect SmugMug to open/.test(await sm.innerText()));
  await go('#/admin/finance/expenses/categories');
  const txt = await fr().evaluate(() => document.body.innerText);
  console.log('categories:', ['Printing and albums', 'Props and backdrops', 'Equipment'].map(n => `${n}=${txt.includes(n)}`).join(' '));
  await p.screenshot({ path: `new-categories-${width}.png`, fullPage: false });
  const sw = await fr().evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  console.log('no hscroll:', sw, 'errors:', errs.length ? errs : 'none', 'external:', ext.length ? ext.slice(0, 3) : 'none');
  await b.close();
})();
