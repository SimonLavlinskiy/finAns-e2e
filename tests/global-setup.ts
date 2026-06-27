import { test as setup, expect } from "@playwright/test";

const SIMON_PASSWORD = process.env.SIMON_PASSWORD ?? "Lavlinskiy02091997";

setup("authenticate as simon", async ({ page }) => {
  await page.goto("/login");

  await page.fill('[placeholder="Логин"]', "simon");
  await page.fill('[placeholder="Пароль"]', SIMON_PASSWORD);
  await page.click('button:has-text("Войти")');

  await expect(page).toHaveURL(/\/projects/);
  await page.click("text=Мои финансы");
  await expect(page).toHaveURL(/\/transactions/);

  await page.context().storageState({ path: "playwright/.auth/simon.json" });
});
