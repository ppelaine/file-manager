const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  page.on('console', msg => console.log('CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  
  await page.goto('http://localhost:1420/', { waitUntil: 'load', timeout: 10000 });
  await page.waitForTimeout(3000);
  
  const html = await page.content();
  const hasRows = html.includes('file-row');
  const hasGrid = html.includes('id="grid"');
  const hasDebug = await page.$eval('#debug', el => el.textContent.substring(0, 200)).catch(e => 'NO DEBUG: ' + e.message);
  const panes = await page.$$eval('.pane', els => els.length).catch(() => 0);
  
  console.log('Has grid:', hasGrid);
  console.log('Has file-rows:', hasRows);
  console.log('Pane count:', panes);
  console.log('Debug:', hasDebug);
  
  await browser.close();
})().catch(err => { console.error('FATAL:', err.message); });
