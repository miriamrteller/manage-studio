const { chromium } = require('playwright');
(async () => {
  const width = Number(process.argv[2] || 390);
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width, height: 900 } });
  const logs = []; const ok = (k, v) => console.log(`${v ? 'PASS' : 'FAIL'} ${k}`);
  p.on('console', m => { if (m.type() === 'error' || (m.type() === 'warning' && !/HOST/.test(m.text()))) logs.push(m.type() + ': ' + m.text()); });
  p.on('pageerror', e => logs.push('pageerror ' + e.message));
  p.on('request', r => { if (!/^(http:\/\/localhost|data:|blob:)/.test(r.url())) logs.push('EXTERNAL ' + r.url()); });
  await p.addInitScript(() => {
    window.addEventListener('click', (e) => {
      const a = e.target && e.target.closest && e.target.closest('a');
      if (a && /^https?:/.test(a.getAttribute('href') || '') && new URL(a.href).origin !== location.origin) { e.preventDefault(); e.stopImmediatePropagation(); console.warn('HOST took over ' + a.href); }
    }, true);
  });
  await p.goto('http://localhost:4174/'); await p.waitForTimeout(2500);
  const f = p.frameLocator('#f'); const fr = () => p.frames().find(x => x !== p.mainFrame());
  const go = async (h) => { await fr().evaluate((x) => { window.location.hash = x; }, h); await p.waitForTimeout(1800); };
  const text = async () => f.locator('body').innerText();
  const shot = (n) => p.screenshot({ path: `/tmp/claude-0/-home-user-manage-studio/d8a799b6-24ab-5ec4-af88-e20301e13946/scratchpad/qp-${n}-${width}.png`, fullPage: true });

  // Seeded accepted quote: Harbor Tech (signed, deposit sent) → progress strip
  await go('#/admin/jobs/d0000000-0000-4000-8000-000000000703');
  let t = await text();
  ok('progress strip on seeded booking', t.includes('Booking progress'));
  ok('seeded strip: deposit step applies (not "No deposit")', !t.includes('No deposit on this booking'));
  // Client accepts Yossi's quote from the public page (signed-out guest)
  await f.getByRole('button', { name: 'Photographer' }).click(); await p.waitForTimeout(500);
  await go('#/quote/a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d400000001');
  await f.getByRole('button', { name: /Accept and book/ }).click(); await p.waitForTimeout(2500);
  t = await text(); await shot('accepted');
  ok('next steps shown after accept', t.includes('Next steps') && /sign the contract, then pay the deposit/i.test(t));
  await f.getByText(/Continue to sign the contract/).first().click(); await p.waitForTimeout(2500);
  ok('lands on contract signing', /enrol\/complete/.test(fr().url()));
  await fr().evaluate(() => { document.querySelectorAll('*').forEach(el => { if (el.scrollHeight > el.clientHeight + 5 && getComputedStyle(el).overflowY.match(/auto|scroll/)) { el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event('scroll')); } }); });
  await p.waitForTimeout(800);
  // Accept the contract (and the optional portfolio box), but not "I don't have an Israeli ID".
  await f.getByLabel(/I have read and accept/).first().check();
  const fullName = f.getByLabel('Full legal name').first();
  // Guest link (#257): name and phone come prefilled; ID and address never do.
  ok('guest link prefills the name', (await fullName.inputValue()) === 'Yossi Ben-David');
  ok('guest link prefills the phone', (await f.getByLabel('Phone number').first().inputValue()) === '+972 54-772-1903');
  ok('guest link leaves ID blank', (await f.getByLabel(/ID number/).first().inputValue()) === '');
  ok('guest link leaves address blank', (await f.getByLabel('Home address').first().inputValue()) === '');
  if (!(await fullName.inputValue())) await fullName.fill('Yossi Ben-David');
  // Signer details (#243): ID, phone, address, then "These details are correct".
  const idf = f.getByLabel(/ID number/); if (await idf.count() && !(await idf.first().inputValue())) await idf.first().fill('000000018');
  const ph = f.getByLabel('Phone number'); if (await ph.count() && !(await ph.first().inputValue())) await ph.first().fill('050-000-0000');
  const ad = f.getByLabel('Home address'); if (await ad.count() && !(await ad.first().inputValue())) await ad.first().fill('1 Example St, Tel Aviv');
  const conf = f.getByText('These details are correct', { exact: true }); if (await conf.count()) await conf.first().click();
  await f.getByRole('button', { name: /Sign/ }).click(); await p.waitForTimeout(3000);
  t = await text(); await shot('signed');
  ok('after signing: next step is pay deposit', /Next: pay the deposit/i.test(t));
  const payBtn = f.getByText(/^Pay deposit$/).first();
  if (await payBtn.count()) { await payBtn.click(); await p.waitForTimeout(2500); }
  ok('on the deposit pay page', /#\/pay\//.test(fr().url()));
  await f.getByRole('button', { name: /Pay/ }).last().click(); await p.waitForTimeout(2500);
  ok('invoice after paying deposit', await f.locator('.demo-invoice').count() === 1);
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  // Photographer sees all three steps done
  await f.getByRole('button', { name: 'Photographer' }).click(); await p.waitForTimeout(800);
  await go('#/admin/jobs/d0000000-0000-4000-8000-000000000702');
  t = await text(); await shot('progress');
  const done = (t.match(/Done/g) || []).length;
  ok(`booking progress: all 3 steps done (found ${done})`, done >= 3 && !t.includes('Waiting for the client'));
  await f.getByRole('button', { name: /Sent messages/ }).click(); await p.waitForTimeout(300);
  ok('booking email has the sign link first', (await f.locator('.demo-outbox li').allInnerTexts()).some(s => /Step 1: sign the contract/.test(s)));
  ok('no external hrefs', (await fr().evaluate(() => document.querySelectorAll('a[href^="https://"]').length)) === 0);
  ok('no horizontal scroll', (await fr().evaluate(() => document.documentElement.scrollWidth)) <= width);
  console.log(logs.join('\n') || 'no console errors / external requests');
  await b.close();
})();
