const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const logs = [];
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
  
  await page.goto('http://localhost:1420/', { waitUntil: 'networkidle', timeout: 10000 });
  await page.waitForTimeout(2000);
  
  // Check file rows exist
  const rowCount = await page.$$eval('#list0 .file-row', rows => rows.length);
  console.log('File rows in pane 0:', rowCount);
  
  // Get first file row info
  const firstRow = await page.$eval('#list0 .file-row', row => ({
    path: row.dataset.path,
    isDir: row.dataset.isDir,
    text: row.textContent.trim()
  })).catch(() => 'NO ROW');
  console.log('First row:', JSON.stringify(firstRow));
  
  // Click the first row (single click)
  if (rowCount > 0) {
    await page.click('#list0 .file-row:first-child');
    await page.waitForTimeout(500);
    
    // Check if it got selected
    const selCount = await page.$$eval('#list0 .file-row.sel', rows => rows.length);
    console.log('Selected rows after click:', selCount);
    
    // Double-click the first row
    await page.click('#list0 .file-row:first-child');
    await page.waitForTimeout(200);
    await page.click('#list0 .file-row:first-child');
    await page.waitForTimeout(2000);
    
    // Check if navigation happened (path changed)
    const status0 = await page.$eval('#st0', el => el.textContent).catch(() => 'NO STATUS');
    console.log('Status after dblclick:', status0);
  }
  
  // Check debug panel
  const debugText = await page.$eval('#debug', el => el.textContent).catch(() => 'NO DEBUG');
  console.log('Debug (last 5):', debugText.split('\n').slice(-5).join(' | '));
  
  await page.screenshot({ path: '/tmp/fm-click.png' });
  console.log('Screenshot: /tmp/fm-click.png');
  await browser.close();
})().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
