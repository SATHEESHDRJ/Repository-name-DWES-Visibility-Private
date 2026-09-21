import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { accountForRole } from './demo-accounts';

const ROLES = [
  { role: 'director', accountRole: 'ops_director', path: '/director', heading: /operations director/i },
  { role: 'admin', accountRole: 'system_admin', path: '/admin', heading: /user management|admin/i },
  { role: 'supervisor', accountRole: 'prod_supervisor', path: '/supervisor', heading: /supervisor/i },
  { role: 'tech', accountRole: 'wiring_technician', path: '/technician', heading: /technician/i },
  { role: 'qaqc', accountRole: 'qaqc_engineer', path: '/qaqc', heading: /qa|qc|inspection/i },
] as const;

async function login(page: Page, username: string, password: string) {
  await page.goto('/');
  await page.getByRole('textbox').first().fill(username);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
}

for (const { role, accountRole, path, heading } of ROLES) {
  test(`role journey: ${role} mounts dashboard`, async ({ page }) => {
    const account = accountForRole(accountRole);
    await login(page, account.username, account.password);
    await expect(page).toHaveURL(new RegExp(`${path.replace('/', '\\/')}`), { timeout: 30_000 });
    await expect(page.locator('#root')).not.toBeEmpty();
    await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible({ timeout: 30_000 });
  });
}
