import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Digital Twin Workflow', () => {
  test('Supervisor can import engineering data and view 3D tabs', async ({ page, request }) => {
    // Log in as supervisor
    await page.goto('http://localhost:5173/login');
    await page.fill('input[name="username"]', 'supervisor1');
    await page.fill('input[name="password"]', 'super123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/.*supervisor.*/);

    // Get token
    const loginRes = await request.post('http://localhost:3001/api/auth/login', {
      data: { username: 'supervisor1', password: 'super123' }
    });
    const { access_token } = await loginRes.json();
    
    // Upload engineering data
    const pkgPath = path.resolve(__dirname, '../../mock-engineering-package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    
    const importRes = await request.post('http://localhost:3001/api/engineering/import/ENOWA_MOBILE_SUBSTATION_132KV_KSA_RIYADH_2026_001/frame_1719100000001', {
      headers: { Authorization: `Bearer ${access_token}` },
      data: pkg
    });
    
    if (importRes.status() === 201 || importRes.status() === 200) {
       const body = await importRes.json();
       await request.post(`http://localhost:3001/api/engineering/approve/${body.model_id}`, {
         headers: { Authorization: `Bearer ${access_token}` }
       });
    }

    // Go to projects page
    await page.goto('http://localhost:5173/supervisor/panels');
    
    // Find the view button for ENOWA MV Panel P1
    // The panel lists panels. 
    await page.waitForSelector('text=ENOWA MV Panel P1');
    const row = page.locator('tr').filter({ hasText: 'ENOWA MV Panel P1' });
    await row.getByRole('button', { name: /twin/i }).click();

    // Check tabs
    await expect(page.getByRole('tab', { name: /Flat 3D/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('tab', { name: /Engineering 3D/i })).toBeVisible({ timeout: 10000 });
    
    console.log('Digital Twin workflow verified successfully!');
  });
});
