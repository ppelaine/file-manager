const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  
  // Capture console
  const logs = [];
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => logs.push(`[PAGE ERROR] ${err.message}`));
  
  await page.goto('http://localhost:1420/', { waitUntil: 'networkidle', timeout: 10000 });
  await page.waitForTimeout(2000); // extra wait for async init
  
  // Check if debug panel has content
  const debugText = await page.$eval('#debug', el => el.textContent).catch(() => 'NO DEBUG PANEL');
  const pane0 = await page.$eval('#st0', el => el.textContent).catch(() => 'NO STATUS');
  const grid = await page.$eval('#grid', el => 'GRID EXISTS').catch(() => 'NO GRID');
  
  console.log('=== DIAGNOSTIC ===');
  console.log('Grid:', grid);
  console.log('Pane0 status:', pane0);
  console.log('Debug panel:', debugText.substring(0, 500));
  console.log('Console logs:', JSON.stringify(logs.slice(-10), null, 2));
  
  await page.screenshot({ path: '/tmp/fm-screenshot.png', fullPage: false });
  console.log('Screenshot saved to /tmp/fm-screenshot.png');
  
  await browser.close();
})().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
