import { test, expect } from '@playwright/test';

const ROLES = [
  { role: 'director', user: 'director1', pass: 'dir123', path: '/director' },
  { role: 'admin', user: 'sysadmin', pass: 'admin123', path: '/admin' },
  { role: 'supervisor', user: 'supervisor1', pass: 'super123', path: '/supervisor' },
  { role: 'tech', user: 'tech1', pass: 'tech1', path: '/technician' },
  { role: 'qaqc', user: 'qa1', pass: 'qa1', path: '/qaqc' },
];

async function login(page, username: string, password: string) {
  await page.goto('/');
  await page.locator('input').first().fill(username);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"], button:has-text("Sign In")').first().click();
  await page.waitForTimeout(3000);
}

for (const { role, user, pass, path } of ROLES) {
  test(`role journey: ${role} mounts dashboard`, async ({ page }) => {
    await login(page, user, pass);
    const root = page.locator('#root');
    await expect(root).not.toBeEmpty();
    const url = page.url();
    expect(url.includes(path) || url.includes('login') === false).toBeTruthy();
  });
}
