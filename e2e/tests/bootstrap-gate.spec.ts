import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { accountForRole } from './demo-accounts';

async function login(page: Page, username: string, password: string) {
  await page.goto('/');
  await page.getByRole('textbox').first().fill(username);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/admin/, { timeout: 30_000 });
}

test('bootstrap gate blocks admin dashboard when bootstrap required', async ({ page }) => {
  const admin = accountForRole('system_admin');
  await login(page, admin.username, admin.password);
  await page.evaluate(() => {
    localStorage.setItem('dwes_bootstrap', JSON.stringify({
      required: true,
      needs_password_rotation: true,
      needs_webauthn_enrollment: true,
    }));
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: /change your password/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.dashboard-shell-root')).toHaveCount(0);
});
