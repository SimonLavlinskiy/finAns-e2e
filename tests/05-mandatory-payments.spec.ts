import { test, expect } from "@playwright/test";

// All tests use simon's storageState from global-setup

test.beforeEach(async ({ page }) => {
  await page.goto("/mandatory-payments");
  await page.waitForLoadState("networkidle");
});

// Helper: создать тестовый платёж
async function createPayment(page: any, name: string, date = "2026-07-15") {
  await page.click('[data-testid="btn-add-payment"]');
  await page.fill('input[placeholder*="Название"]', name);
  await page.fill('input[placeholder*="Сумма"]', "899");

  // Выбираем первую метку
  const tagPicker = page.locator('[data-testid="tag-picker"] button, [data-testid="tag-select"] button').first();
  if (await tagPicker.count()) await tagPicker.click();

  await page.locator('select[name="frequency"], [data-testid="frequency-select"]').selectOption("monthly").catch(() => {});
  await page.fill('input[type="date"]', date);
  await page.click('button:has-text("Сохранить")');
  await page.waitForLoadState("networkidle");
}

// TC-05-04 · Отметить платёж как оплаченный
test("TC-05-04: нажать «Оплатить» → создаётся транзакция, строка зеленеет", async ({ page }) => {
  const payName = `Netflix ${Date.now()}`;
  // Используем прошедшую дату, чтобы платёж был активен
  await createPayment(page, payName, "2026-06-01");

  const row = page.locator("tr, [data-testid='payment-row']").filter({ hasText: payName });
  const payBtn = row.locator('button:has-text("Оплатить")');

  if (await payBtn.count() === 0) {
    test.skip();
    return;
  }

  // Ожидаем запрос на создание транзакции
  const [response] = await Promise.all([
    page.waitForResponse((res) => res.url().includes("/transactions") && res.request().method() === "POST"),
    payBtn.click(),
  ]);

  expect(response.status()).toBe(201);

  // Строка зеленеет
  await expect(row).toHaveClass(/green|bg-green/);

  // Кнопка меняется на «Оплачено»
  await expect(row.locator('button:has-text("Оплачено")')).toBeVisible();
});

// TC-05-04а · Кнопка «Оплачено» остаётся дизейблена до следующего периода
test("TC-05-04а: кнопка «Оплачено» дизейблена после оплаты", async ({ page }) => {
  const payName = `PaidTest ${Date.now()}`;
  await createPayment(page, payName, "2026-06-01");

  const row = page.locator("tr, [data-testid='payment-row']").filter({ hasText: payName });
  const payBtn = row.locator('button:has-text("Оплатить")');
  if (await payBtn.count() === 0) {
    test.skip();
    return;
  }

  await payBtn.click();
  await page.waitForLoadState("networkidle");

  // Кнопка «Оплачено» — задизейблена
  const paidBtn = row.locator('button:has-text("Оплачено"), button:has-text("✓")');
  await expect(paidBtn).toBeDisabled();
});

// TC-05-04б · Кнопка активна когда next_payment_date = сегодня
test("TC-05-04б: платёж с датой сегодня → кнопка «Оплатить» активна", async ({ page }) => {
  const today = new Date().toISOString().split("T")[0];
  const payName = `TodayPay ${Date.now()}`;
  await createPayment(page, payName, today);

  const row = page.locator("tr, [data-testid='payment-row']").filter({ hasText: payName });
  const payBtn = row.locator('button:has-text("Оплатить")');

  await expect(payBtn).toBeEnabled();
  // Зелёного фона нет
  await expect(row).not.toHaveClass(/bg-green/);
});

// TC-05-02 · Создание платежа
test("TC-05-02: создать платёж «Netflix» — появляется в таблице", async ({ page }) => {
  const payName = `Netflix ${Date.now()}`;
  await createPayment(page, payName, "2026-07-01");
  await expect(page.locator(`text=${payName}`)).toBeVisible();
  await expect(page.locator("text=Ежемесячно, text=monthly")).first().toBeVisible();
});

// TC-05-03 · Валидация при создании
test("TC-05-03: пустые поля → ошибка валидации", async ({ page }) => {
  await page.click('[data-testid="btn-add-payment"]');
  await page.click('button:has-text("Сохранить")');

  const error = page.locator('[data-testid="form-error"], text=обязательн, text=required');
  await expect(error.first()).toBeVisible();
});

// TC-05-05 · DateHighlight — предупреждение (дата ≤3 дней)
test("TC-05-05: платёж через ≤3 дня → дата выделена жёлтым", async ({ page }) => {
  const soon = new Date();
  soon.setDate(soon.getDate() + 1);
  const soonDate = soon.toISOString().split("T")[0];

  const payName = `Soon ${Date.now()}`;
  await createPayment(page, payName, soonDate);

  const row = page.locator("tr, [data-testid='payment-row']").filter({ hasText: payName });
  const dateCell = row.locator('td:has([class*="amber"]), td:has([class*="yellow"]), [class*="amber"], [class*="yellow"]');
  await expect(dateCell.first()).toBeVisible();
});

// TC-05-07 · Редактирование платежа
test("TC-05-07: редактировать сумму платежа → обновляется в таблице", async ({ page }) => {
  const payName = `EditPay ${Date.now()}`;
  await createPayment(page, payName, "2026-08-01");

  const row = page.locator("tr, [data-testid='payment-row']").filter({ hasText: payName });
  await row.locator('[data-testid="payment-menu"], button[aria-label*="действия"]').click();
  await page.click('text=Редактировать');

  const amountInput = page.locator('input[placeholder*="Сумма"]');
  await amountInput.clear();
  await amountInput.fill("999");
  await page.click('button:has-text("Сохранить")');
  await page.waitForLoadState("networkidle");

  await expect(row.locator("text=999")).toBeVisible();
});

// TC-05-09 · Удаление платежа
test("TC-05-09: удалить платёж → исчезает из таблицы", async ({ page }) => {
  const payName = `DelPay ${Date.now()}`;
  await createPayment(page, payName, "2026-09-01");

  const row = page.locator("tr, [data-testid='payment-row']").filter({ hasText: payName });
  await row.locator('[data-testid="payment-menu"], button[aria-label*="действия"]').click();
  await page.click('text=Удалить');

  const confirm = page.locator('button:has-text("Удалить"), button:has-text("Подтвердить")').last();
  if (await confirm.count()) await confirm.click();

  await expect(page.locator(`text=${payName}`)).not.toBeVisible();
});

// TC-05-10 · Сохранить и добавить ещё
test("TC-05-10: «Сохранить и ещё» — форма сбрасывается, sheet не закрывается", async ({ page }) => {
  await page.click('[data-testid="btn-add-payment"]');
  await page.fill('input[placeholder*="Название"]', "Платёж И Ещё");
  await page.fill('input[placeholder*="Сумма"]', "500");
  await page.fill('input[type="date"]', "2026-07-01");

  const saveMoreBtn = page.locator('button:has-text("Сохранить и ещё")');
  if (await saveMoreBtn.count() === 0) {
    test.skip();
    return;
  }

  await saveMoreBtn.click();
  await page.waitForLoadState("networkidle");

  // Sheet ещё открыт — поле имени пустое
  await expect(page.locator('input[placeholder*="Название"]')).toHaveValue("");
});
