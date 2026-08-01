import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('kv.acceso', '1');
  });
});

test('la carta permanece visible y .cielo-fondo se retira al conceder el acceso', async ({ page }) => {
  await page.goto('http://localhost:5183/');

  const carta = page.locator('.carta').first();
  await expect(carta).toBeVisible({ timeout: 5000 });

  // .cielo-fondo era del Portal_Acceso; tras conceder el acceso no debe quedar
  // montado como hermano de .regalo (antes nunca se destruia).
  await expect(page.locator('.cielo-fondo')).toHaveCount(0);

  await page.waitForTimeout(3000);

  await expect(carta).toBeVisible();
  await expect(page.locator('.cielo-fondo')).toHaveCount(0);

  const opacidad = await carta.evaluate((el) => getComputedStyle(el).opacity);
  expect(Number(opacidad)).toBeGreaterThan(0.9);
});
