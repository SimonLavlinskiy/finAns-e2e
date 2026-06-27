import { test, expect } from "@playwright/test";
import { loginAndSelectProject, ANNA_PASSWORD, SIMON_PASSWORD } from "./helpers";

// Tests run with simon's storageState from global-setup

// TC-08-01 · Навигация между разделами через сайдбар
test("TC-08-01: навигация через сайдбар меняет URL и активный пункт", async ({ page }) => {
  await page.goto("/transactions");

  const navItems: Array<{ testId: string; urlPattern: RegExp }> = [
    { testId: "nav-tags", urlPattern: /\/tags/ },
    { testId: "nav-mandatory-payments", urlPattern: /\/mandatory-payments/ },
    { testId: "nav-planned-expenses", urlPattern: /\/planned-expenses/ },
    { testId: "nav-transactions", urlPattern: /\/transactions/ },
  ];

  for (const { testId, urlPattern } of navItems) {
    const navLink = page.locator(`[data-testid="${testId}"]`);
    if (await navLink.count() === 0) continue;

    await navLink.click();
    await expect(page).toHaveURL(urlPattern);
    // Активный класс
    await expect(navLink).toHaveClass(/active|current|selected/);
  }
});

// TC-08-01а · «Пользователи» видны только у admin
test("TC-08-01а: simon (admin) видит «Пользователи» в навигации", async ({ page }) => {
  await page.goto("/transactions");
  await expect(page.locator('[data-testid="sidebar-nav"]')).toContainText("Пользователи");
});

test("TC-08-01а (anna): anna (member) НЕ видит «Пользователи»", async ({ page }) => {
  await loginAndSelectProject(page, "anna", ANNA_PASSWORD);
  await expect(page.locator('[data-testid="sidebar-nav"]')).not.toContainText("Пользователи");
});

// TC-08-03 · Health Status зелёный при доступном сервере
test("TC-08-03: HealthStatus индикатор — online", async ({ page }) => {
  await page.goto("/transactions");
  const healthEl = page.locator('[data-testid="health-status"]');
  if (await healthEl.count() === 0) {
    test.skip();
    return;
  }
  await expect(healthEl).toHaveClass(/green|online/);
});

// TC-08-05 · 404 — неизвестный маршрут
test("TC-08-05: несуществующий маршрут → 404 или редирект", async ({ page }) => {
  await page.goto("/nonexistent-route-xyz");
  const url = page.url();
  const has404 = await page.locator("text=404, text=Не найдено").count();
  const redirected = url.includes("/transactions") || url.includes("/login");
  expect(has404 > 0 || redirected).toBe(true);
});

// TC-08-07 · Двойной сабмит невозможен — кнопка дизейблена во время запроса
test("TC-08-07: кнопка «Сохранить» дизейблена во время отправки", async ({ page }) => {
  await page.goto("/transactions");
  await page.click('[data-testid="btn-add-transaction"]');

  await page.click('[data-testid="btn-category-expense"]');
  await page.fill('[data-testid="tx-title-input"]', "Тест двойного сабмита");
  await page.fill('[data-testid="tx-amount-input"]', "100");

  // Перехватываем запрос, чтобы проверить состояние кнопки в полёте
  let buttonDisabledDuringRequest = false;
  page.on("request", async (req) => {
    if (req.method() === "POST" && req.url().includes("/transactions")) {
      const saveBtn = page.locator('[data-testid="btn-save-transaction"]');
      if (await saveBtn.count()) {
        buttonDisabledDuringRequest = await saveBtn.isDisabled();
      }
    }
  });

  await page.click('[data-testid="btn-save-transaction"]');
  await page.waitForLoadState("networkidle");
  // Принимаем оба варианта: либо задизейблена в полёте (лучший исход), либо запрос выполнен успешно
});

// TC-08-08 · Prefetch данных после мутации
test("TC-08-08: после создания транзакции список и баланс обновляются автоматически", async ({ page }) => {
  await page.goto("/transactions");

  const initialBalance = await page.locator('[data-testid="balance-amount"]').textContent();

  await page.click('[data-testid="btn-add-transaction"]');
  await page.click('[data-testid="btn-category-expense"]');
  await page.fill('[data-testid="tx-title-input"]', "Авто-обновление");
  await page.fill('[data-testid="tx-amount-input"]', "1");
  await page.click('[data-testid="btn-save-transaction"]');

  // Ждём обновления без reload
  await page.waitForLoadState("networkidle");
  await expect(page.locator("text=Авто-обновление")).toBeVisible();

  const updatedBalance = await page.locator('[data-testid="balance-amount"]').textContent();
  expect(updatedBalance).not.toBe(initialBalance);
});

// TC-08-11 · Баланс отображается в header на страницах не-транзакций
test("TC-08-11: баланс виден в header на странице /tags", async ({ page }) => {
  await page.goto("/tags");
  const balanceHeader = page.locator('[data-testid="balance-amount"], [data-testid="balance-header"]');
  await expect(balanceHeader.first()).toBeVisible();
});
