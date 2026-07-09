import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

const ROLES = [
  { role: 'director', user: 'director1', pass: 'dir123', path: '/director', heading: /operations director/i },
  { role: 'admin', user: 'sysadmin', pass: 'admin123', path: '/admin', heading: /user management|admin/i },
  { role: 'supervisor', user: 'supervisor1', pass: 'super123', path: '/supervisor', heading: /supervisor/i },
  { role: 'tech', user: 'tech1', pass: 'tech1', path: '/technician', heading: /technician/i },
  { role: 'qaqc', user: 'qa1', pass: 'qa1', path: '/qaqc', heading: /qa|qc|inspection/i },
] as const;

async function login(page: Page, username: string, password: string) {
  await page.goto('/');
  await page.getByRole('textbox').first().fill(username);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
}

for (const { role, user, pass, path, heading } of ROLES) {
  test(`role journey: ${role} mounts dashboard`, async ({ page }) => {
    await login(page, user, pass);
    await expect(page).toHaveURL(new RegExp(`${path.replace('/', '\\/')}`), { timeout: 30_000 });
    await expect(page.locator('#root')).not.toBeEmpty();
    await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible({ timeout: 30_000 });
  });
}
