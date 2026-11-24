const { chromium } = require('playwright');
(async () => {
  const width = Number(process.argv[2] || 390);
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width, height: 900 } });
  const logs = []; const ok = (k, v) => console.log(`${v ? 'PASS' : 'FAIL'} ${k}`);
  p.on('console', m => { if (m.type() === 'error' || (m.type() === 'warning' && !/HOST/.test(m.text()))) logs.push(m.type() + ': ' + m.text()); });
  p.on('pageerror', e => logs.push('pageerror ' + e.message));
  p.on('request', r => { const u = r.url(); if (!/^(http:\/\/localhost|data:|blob:)/.test(u)) logs.push('EXTERNAL ' + u); });
  await p.addInitScript(() => {
    window.addEventListener('click', (e) => {
      const a = e.target && e.target.closest && e.target.closest('a');
      if (a && /^https?:/.test(a.getAttribute('href') || '') && new URL(a.href).origin !== location.origin) {
        e.preventDefault(); e.stopImmediatePropagation(); console.warn('HOST took over ' + a.href);
      }
    }, true);
  });
  await p.goto('http://localhost:4174/'); await p.waitForTimeout(2500);
  const f = p.frameLocator('#f'); const fr = () => p.frames().find(x => x !== p.mainFrame());
  const go = async (h) => { await fr().evaluate((x) => { window.location.hash = x; }, h); await p.waitForTimeout(1800); };
  const closeAll = async () => { await p.keyboard.press('Escape'); await p.waitForTimeout(300); };
  const shot = (n) => p.screenshot({ path: `/tmp/claude-0/-home-user-manage-studio/d8a799b6-24ab-5ec4-af88-e20301e13946/scratchpad/fs-${n}-${width}.png`, fullPage: true });

  // Admin: shoots list + row gallery link
  await go('#/admin/jobs'); await shot('jobs');
  await f.locator('a:visible', { hasText: /^Gallery$/ }).first().click(); await p.waitForTimeout(800);
  ok('shoots row Gallery link opens preview', await f.locator('.demo-gallery').count() === 1); await closeAll();
  // JobDetail Open gallery
  await go('#/admin/jobs/d0000000-0000-4000-8000-000000000707');
  await f.locator(':visible', { hasText: /^Open gallery$/ }).last().click(); await p.waitForTimeout(800);
  ok('shoot page Open gallery opens preview', await f.locator('.demo-gallery').count() === 1); await closeAll();
  ok('payments heading has no i18n error', (await f.locator('body').innerText()).indexOf('returned an object') === -1);
  // New shoot → search existing client
  await go('#/admin/jobs');
  await f.getByRole('button', { name: /New shoot/ }).click(); await p.waitForTimeout(800);
  const combo = f.getByRole('combobox').first();
  await combo.click(); await combo.fill('daniel'); await p.waitForTimeout(1500);
  const opt = f.getByRole('option', { name: /Daniel Avraham/ }).first();
  ok('client search finds "daniel"', await opt.count() === 1);
  await shot('newshoot-search');
  await opt.click(); await p.waitForTimeout(500);
  ok('client selected', (await f.locator('body').innerText()).includes('Daniel Avraham'));
  for (const q of ['0534471188', 'rosen.family@example.com']) {
    await combo.fill(''); await combo.fill(q); await p.waitForTimeout(1500);
    ok(`client search finds "${q}"`, await f.getByRole('option').count() >= 1);
  }
  // Client portal (F's ClientPortal)
  await f.getByRole('button', { name: 'Client', exact: true }).click(); await p.waitForTimeout(2500);
  await shot('client-portal');
  const body = await f.locator('body').innerText();
  ok('client portal has no "children"', !/children/i.test(body));
  ok('client portal shows the shoot', body.includes('Event Coverage'));
  const pay = f.getByRole('button', { name: /^Pay/ }).first();
  ok('client portal has Pay', await pay.count() === 1);
  await pay.click(); await p.waitForTimeout(2000);
  await f.getByRole('button', { name: /Pay/ }).last().click(); await p.waitForTimeout(2500);
  ok('invoice shown after paying', await f.locator('.demo-invoice').count() === 1);
  await closeAll();
  await go('#/dashboard'); await p.waitForTimeout(800); await shot('client-paid');
  const g = f.getByText(/Open (your |the )?gallery/i).first();
  ok('client gallery link present after paying', await g.count() === 1);
  if (await g.count()) { await g.click(); await p.waitForTimeout(800); ok('client gallery opens preview', await f.locator('.demo-gallery').count() === 1); await closeAll(); }
  await f.getByRole('button', { name: /Sent messages/ }).click(); await p.waitForTimeout(300);
  ok('gallery-ready email in outbox', (await f.locator('.demo-outbox__subject').allInnerTexts()).some(s => /gallery/i.test(s)));
  await closeAll();
  // Client contract signing from the portal: switch to a client with an unsigned contract is not seeded; check the signed state renders
  ok('external hrefs left', (await fr().evaluate(() => document.querySelectorAll('a[href^="https://"]').length)) === 0);
  ok('no horizontal scroll', (await fr().evaluate(() => document.documentElement.scrollWidth)) <= width);
  console.log(logs.join('\n') || 'no console errors / external requests');
  await b.close();
})();
