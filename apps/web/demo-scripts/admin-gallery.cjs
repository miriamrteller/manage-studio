const { chromium, devices } = require('playwright');
(async () => {
  const width = Number(process.argv[2] || 390);
  const ua = process.argv[3] === 'ipad' ? devices['iPad (gen 7)'].userAgent : undefined;
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width, height: 900 }, userAgent: ua, hasTouch: !!ua });
  const p = await ctx.newPage(); const hijacked = [];
  p.on('console', m => { if (/HOST took over/.test(m.text())) hijacked.push(m.text()); });
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
  const tap = async (loc) => (ua ? loc.tap() : loc.click());
  // shoots list links
  await go('#/admin/jobs');
  const rowLinks = f.locator('a:visible', { hasText: /^Gallery$/ });
  console.log(`[${width}${ua ? ' ipad' : ''}] visible list Gallery links:`, await rowLinks.count());
  for (let i = 0; i < await rowLinks.count(); i++) {
    await tap(rowLinks.nth(i)); await p.waitForTimeout(600);
    console.log('  list link', i, '-> preview', await f.locator('.demo-gallery').count()); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  }
  for (let n = 1; n <= 8; n++) {
    await go(`#/admin/jobs/d0000000-0000-4000-8000-00000000070${n}`);
    const status = await f.locator('select').first().inputValue().catch(() => '?');
    const btn = f.locator(':is(a,button):visible', { hasText: /^Open gallery$/ }).last();
    const exists = await btn.count();
    const disabled = exists ? await btn.isDisabled().catch(() => false) : null;
    let opened = null;
    if (exists && !disabled) { await tap(btn); await p.waitForTimeout(600); opened = await f.locator('.demo-gallery').count(); await p.keyboard.press('Escape'); await p.waitForTimeout(200); }
    console.log(`  shoot 70${n} status=${status} openGallery=${exists ? (disabled ? 'DISABLED' : 'enabled') : 'none'} opened=${opened}`);
  }
  // Re-render: type a link on a shoot with none, open before and after saving, then edit it.
  await go('#/admin/jobs/d0000000-0000-4000-8000-000000000703');
  const input = f.locator('#job-gallery-url');
  const open = f.locator(':is(a,button):visible', { hasText: /^Open gallery$/ }).last();
  await input.fill('https://gallery.lumen-light.demo/new'); await p.waitForTimeout(300);
  await tap(open); await p.waitForTimeout(500);
  console.log('  typed link -> preview', await f.locator('.demo-gallery').count()); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  await f.getByRole('button', { name: 'Save' }).click(); await p.waitForTimeout(1500);
  await tap(open); await p.waitForTimeout(500);
  console.log('  after save -> preview', await f.locator('.demo-gallery').count()); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  await input.fill('https://gallery.lumen-light.demo/new-2'); await p.waitForTimeout(300);
  await tap(open); await p.waitForTimeout(500);
  console.log('  edited link -> preview', await f.locator('.demo-gallery').count()); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  await go('#/admin/jobs');
  console.log('  list links after save:', await f.locator('a:visible', { hasText: /^Gallery$/ }).count());
  console.log('  external hrefs left:', await fr().evaluate(() => document.querySelectorAll('a[href^="https://"]').length));
  console.log('  host takeovers:', hijacked.length);
  await b.close();
})();
