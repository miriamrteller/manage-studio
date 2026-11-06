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
  const shot = (n) => p.screenshot({ path: `/tmp/claude-0/-home-user-manage-studio/d8a799b6-24ab-5ec4-af88-e20301e13946/scratchpad/cl-${n}-${width}.png`, fullPage: true });

  const lang = process.argv[3] || 'en'; const he = lang === 'he';
  const L = he ? { title: 'לקוחות', newShoot: 'צילום חדש', add: 'הוספת לקוח', shoots: 'צילומים' } : { title: 'Clients', newShoot: 'New shoot', add: 'Add client', shoots: 'Shoots' };
  if (he) { await f.locator('button', { hasText: 'עברית' }).first().click(); await p.waitForTimeout(1500); }
  await go('#/admin/students'); await p.waitForTimeout(800); await shot('clients-' + lang);
  let body = await f.locator('body').innerText();
  ok('Clients title', (await f.locator('h1').first().innerText()).trim() === L.title);
  ok('no class/guardian wording', !/\b(class|classes|guardian|parent|student)\b/i.test(body) && !/(שיעור|הורה|תלמיד|בית הספר)/.test(body));
  ok('client rows listed', body.includes('Daniel Avraham') && body.includes('Friedman'));
  ok('shoot names shown', /Event Coverage|Family Session/.test(body));
  // Per-row New shoot for the row containing Friedman
  const rowBtn = f.locator('tr, li, [role=row], div.rounded-lg, div.border').filter({ hasText: 'Friedman' }).getByRole('button', { name: L.newShoot }).first();
  ok('row has New shoot', await rowBtn.count() === 1);
  await rowBtn.click(); await p.waitForTimeout(2000);
  let h = await fr().evaluate(() => location.hash);
  ok('goes to Shoots (' + h + ')', h.startsWith('#/admin/jobs'));
  await shot('newshoot-prefill-' + lang);
  body = await f.locator('body').innerText();
  const combo = f.getByRole('combobox').first();
  const val = await combo.inputValue().catch(() => '');
  ok('form open with Friedman prefilled (' + val + ')', /Friedman/.test(val) || /Friedman/.test(body));
  // Add client opens the form in New client mode
  await go('#/admin/students'); await p.waitForTimeout(800);
  await f.getByRole('button', { name: L.add }).first().click(); await p.waitForTimeout(2000);
  h = await fr().evaluate(() => location.hash);
  ok('Add client goes to Shoots form (' + h + ')', h.startsWith('#/admin/jobs'));
  const inputs = await f.locator('input:visible').count();
  ok('new-client form fields shown (' + inputs + ')', inputs >= 2);
  await shot('addclient-' + lang);
  ok('no horizontal scroll', (await fr().evaluate(() => document.documentElement.scrollWidth)) <= width);
  console.log(logs.join('\n') || 'no console errors / external requests');
  await b.close();
})();
