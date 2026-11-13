const { chromium } = require('playwright');
(async () => {
  const width = Number(process.argv[2] || 1280), view = process.argv[3] || 'admin';
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width, height: 900 } });
  const logs = []; p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.text()); }); p.on('pageerror', e => logs.push('pageerror ' + e.message));
  await p.goto('http://localhost:4174/'); await p.waitForTimeout(2500);
  const fr = () => p.frames().find(x => x !== p.mainFrame()); const f = p.frameLocator('#f');
  if (view === 'client') { await f.getByRole('button', { name: 'Client', exact: true }).click(); await p.waitForTimeout(2500); }
  // collect menu links
  await f.locator('header button').first().click().catch(() => {}); await p.waitForTimeout(800);
  let hrefs = [];
  await p.keyboard.press('Escape');
  const extra = (process.argv[4] || '').split(',').filter(Boolean);
  hrefs = [...new Set([...hrefs, ...extra])].filter(h => !/logout/.test(h));
  console.log('pages:', hrefs.join(' '));
  for (const h of hrefs) {
    logs.length = 0;
    await fr().evaluate((x) => { location.hash = x; }, h); await p.waitForTimeout(2200);
    const txt = await fr().evaluate(() => document.body.innerText);
    const bad = [];
    const m = txt.match(/Could not find the function[^\n]*/g); if (m) bad.push(...m);
    if (/Something went wrong|Error loading|Failed to load|שגיאה/i.test(txt)) bad.push('error text: ' + (txt.match(/[^\n]*(Something went wrong|Error loading|Failed to load|שגיאה)[^\n]*/i) || [''])[0]);
    const l = logs.filter(x => !/HOST|DevTools|React Router Future/.test(x));
    console.log(`${bad.length || l.length ? 'ISSUE' : 'ok   '} ${h}  ${bad.concat(l.slice(0, 3)).join(' || ').slice(0, 400)}`);
  }
  await b.close();
})();
