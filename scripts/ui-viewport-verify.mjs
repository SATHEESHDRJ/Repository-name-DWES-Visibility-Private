import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

// For Windows, default Chrome path:
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const VIEWPORTS = [
  { width: 1920, height: 1080, name: '1080p' },
  { width: 1440, height: 960, name: 'Xiaomi_Pad_7_Pro_12_1' },
  { width: 1280, height: 800, name: 'Samsung_Tab_A9_10_5' },
  { width: 1180, height: 820, name: 'iPad_10th_Gen_10_9' },
  { width: 1024, height: 768, name: 'Generic_Tablet_Landscape' },
  { width: 820, height: 1180, name: 'iPad_10th_Gen_Portrait' },
  { width: 800, height: 1280, name: 'Samsung_Tab_A9_Portrait' },
  { width: 768, height: 1024, name: 'Generic_Tablet_Portrait' },
];

async function run() {
  console.log('Starting viewport verification...');
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    // Assuming dev server is running on 5173
    const url = 'http://localhost:5173/';
    
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle2' }).catch(err => {
      console.log('Ensure dev server is running on 5173');
      throw err;
    });

    const outDir = path.join(process.cwd(), 'viewport-screenshots');
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    for (const vp of VIEWPORTS) {
      console.log(`Testing viewport ${vp.name} (${vp.width}x${vp.height})...`);
      await page.setViewport({ width: vp.width, height: vp.height });
      await new Promise(r => setTimeout(r, 1000)); // wait for layout shift
      await page.screenshot({ path: path.join(outDir, `${vp.name}.png`), fullPage: true });
    }

    console.log('Viewport verification completed successfully!');
  } catch (err) {
    console.error('Error during viewport verification:', err);
  } finally {
    if (browser) await browser.close();
  }
}

run();
