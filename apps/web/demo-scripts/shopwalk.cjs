const { chromium } = require('playwright');
(async () => {
  const width = Number(process.argv[2] || 390);
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('request', r => { const u = r.url(); if (!/^(http:\/\/localhost|data:|blob:)/.test(u)) errs.push('EXTERNAL ' + u); });
  const ok = (k, v) => console.log(`${v ? 'PASS' : 'FAIL'} ${k}`);
  await p.goto('http://localhost:4174/'); await p.waitForTimeout(2500);
  const f = p.frameLocator('#f'); const fr = () => p.frames().find(x => x !== p.mainFrame());
  const go = async (h) => { await fr().evaluate((x) => { location.hash = x; }, h); await p.waitForTimeout(2200); };
  const shot = (n) => p.screenshot({ path: `shop-${n}-${width}.png`, fullPage: true });
  // Client view
  await f.getByRole('button', { name: 'Client', exact: true }).click(); await p.waitForTimeout(2500);
  await go('#/dashboard/portal');
  const shopHeading = f.getByRole('heading', { name: /photo/i }).filter({ hasText: /shop|photos/i });
  const imgs = f.locator('img[alt*="IMG_"]');
  ok('client sees the shop previews', await imgs.count() === 15);
  ok('previews are local images', (await imgs.first().getAttribute('src')).startsWith('/assets/') || (await imgs.first().getAttribute('src')).includes('shop-'));
  ok('delivered order has a download link', await f.getByRole('link', { name: /download/i }).count() >= 1);
  await shot('client');
  const addBtns = f.getByRole('button', { name: /^Add/i });
  await addBtns.nth(0).click(); await addBtns.nth(0).click(); await p.waitForTimeout(500);
  const payBtn = f.getByRole('button', { name: /^Pay /i }).first();
  ok('pay button shows ₪50', /50/.test(await payBtn.innerText()));
  await payBtn.click(); await p.waitForTimeout(2500);
  const hash = await fr().evaluate(() => location.hash);
  ok('goes to the pay page', /#\/pay\//.test(hash));
  await shot('pay');
  const payNow = f.getByRole('button', { name: /pay/i }).first();
  if (await payNow.count()) { await payNow.click(); await p.waitForTimeout(3000); }
  await go('#/dashboard/portal');
  ok('after paying: preparing (paid, not yet delivered)', await f.getByText(/preparing/i).count() >= 1);
  // Admin view
  const closeBtn = f.getByRole('button', { name: /^Close$/ }).first();
  if (await closeBtn.count()) { await closeBtn.click(); await p.waitForTimeout(500); }
  await f.getByRole('button', { name: 'Photographer', exact: true }).click(); await p.waitForTimeout(2500);
  await go('#/admin/jobs/d0000000-0000-4000-8000-000000000708');
  const body = await fr().evaluate(() => document.body.innerText);
  ok('admin card shows the SmugMug note', /in real use these come from your SmugMug/.test(body));
  ok('admin sees orders', /Delivered|delivered/.test(body));
  await shot('admin');
  { const t = await fr().evaluate(() => document.body.innerText); const i = t.indexOf('Photo shop'); console.log('ADMIN SHOP:', t.slice(i, i + 900).replace(/\n+/g, ' | ')); }
  const linkBox = f.getByLabel(/download gallery link/i).first();
  if (await linkBox.count()) {
    await linkBox.fill('https://photos.example.com/d/demo'); await f.getByRole('button', { name: /^Send/i }).first().click(); await p.waitForTimeout(1500);
    ok('delivered with a link', (await fr().evaluate(() => document.body.innerText)).includes('https://photos.example.com/d/demo'));
  } else ok('delivery box present', false);
  console.log('errs:', errs.filter(e => !/HOST/.test(e)).join(' | ') || 'none');
  await b.close();
})();
