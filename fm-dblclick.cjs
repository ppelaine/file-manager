const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const logs = [];
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
  
  await page.goto('http://localhost:1420/', { waitUntil: 'networkidle', timeout: 10000 });
  await page.waitForTimeout(2000);
  
  console.log('Status before:', await page.$eval('#st0', el => el.textContent));
  
  // Use Playwright's dblclick (fast, ~100ms between clicks)
  await page.dblclick('#list0 .file-row:first-child');
  await page.waitForTimeout(2000);
  
  console.log('Status after:', await page.$eval('#st0', el => el.textContent));
  
  const debugText = await page.$eval('#debug', el => el.textContent).catch(() => 'NO DEBUG');
  console.log('Debug tail:', debugText.split('\n').slice(-5).join(' | '));
  
  await page.screenshot({ path: '/tmp/fm-dblclick.png' });
  await browser.close();
})().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
