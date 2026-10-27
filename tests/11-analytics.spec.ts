import { expect, test, type Page } from "@playwright/test";

// Раздел «Аналитика» (change analytics-redesign): вкладки, лимиты, планирование, адаптив.
// Тесты возвращают данные в исходное состояние (лимит и планирование), т.к. baseURL
// по умолчанию — прод.

async function openAnalytics(page: Page, query = "") {
  await page.goto(`/analytics${query}`);
  await expect(page.getByRole("heading", { name: "Аналитика", level: 1 })).toBeVisible();
}

test.describe("Аналитика", () => {
  test("обзор месяца: вкладка по умолчанию, блоки 1–3, нет старых виджетов", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() =>
      Object.keys(localStorage)
        .filter((k) => k.startsWith("analytics.tab."))
        .forEach((k) => localStorage.removeItem(k)),
    );
    await openAnalytics(page);

    await expect(page.getByRole("button", { name: "Обзор месяца" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("heading", { name: /Доходы и расходы (сейчас|за )/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Расходы по категориям и лимиты" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Динамика доходов и расходов" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Сравнение месяцев" })).toBeVisible();

    await expect(page.getByText("Индекс свободы")).toHaveCount(0);
    await expect(page.getByText("Прогноз баланса")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /\+ Операция/ })).toHaveCount(0);

    // Будущих месяцев нет: на текущем месяце стрелка «вперёд» неактивна.
    await expect(page.getByRole("button", { name: "Следующий месяц" })).toBeDisabled();
  });

  test("переключение месяца меняет заголовок блока 1", async ({ page }) => {
    await openAnalytics(page, "?tab=overview");
    const prev = page.getByRole("button", { name: "Предыдущий месяц" });
    test.skip(await prev.isDisabled(), "в проекте один месяц с операциями");
    await prev.click();
    await expect(page.getByRole("heading", { name: /Доходы и расходы за / })).toBeVisible();
    await expect(page.getByText("Можно тратить в день")).toHaveCount(0);
  });

  test("лимит: создание через «+ Лимит» и удаление", async ({ page }) => {
    await openAnalytics(page, "?tab=overview");
    const addLimit = page.getByRole("button", { name: "Лимит", exact: true }).first();
    test.skip((await addLimit.count()) === 0, "у всех категорий уже есть лимиты");

    // id строки фиксируем заранее: после сохранения строки пересортировываются.
    const rowId = await page.locator("li[id^='limits-row-']").filter({ has: addLimit }).first().getAttribute("id");
    const row = page.locator(`li#${rowId}`);
    await addLimit.click();
    const input = row.getByRole("textbox").first();
    await input.fill("12345");
    const saved = page.waitForResponse((r) => r.url().includes("/spending-limits/by-category/") && r.request().method() === "PUT");
    await input.press("Enter");
    expect((await saved).status()).toBe(200);
    await expect(page.getByText(/Лимит сохранён: .+ — 12\s345\s₽/)).toBeVisible();

    // Убрать лимит (вернуть исходное состояние).
    await row.getByRole("button", { name: /Редактировать лимит/ }).first().click();
    const removed = page.waitForResponse((r) => r.url().includes("/spending-limits/by-category/") && r.request().method() === "DELETE");
    await row.getByRole("button", { name: "Убрать лимит" }).click();
    expect((await removed).status()).toBe(204);
  });

  test("планирование: сохраняется после перезагрузки, вкладка запоминается", async ({ page }) => {
    await openAnalytics(page, "?tab=planner");
    await expect(page.getByRole("button", { name: "Предыдущий месяц" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Что останется" })).toBeVisible();

    const source = page.getByRole("textbox", { name: "Источник" }).first();
    const amount = page.getByRole("textbox", { name: "Сумма" }).first();
    const before = { source: await source.inputValue(), amount: await amount.inputValue() };

    const marker = `E2E доход ${Date.now()}`;
    await source.fill(marker);
    const put = page.waitForResponse((r) => r.url().endsWith("/api/v1/planner") && r.request().method() === "PUT");
    await amount.fill(String(100000 + (Date.now() % 1000)));
    expect((await put).status()).toBe(200);

    await page.goto("/analytics");
    await expect(page.getByRole("button", { name: "Планирование", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("textbox", { name: "Источник" }).first()).toHaveValue(marker);
    await expect(page.getByText("Свободно после всех трат").or(page.getByText("Не хватает"))).toBeVisible();

    // Вернуть прежние значения.
    const restore = page.waitForResponse((r) => r.url().endsWith("/api/v1/planner") && r.request().method() === "PUT");
    await page.getByRole("textbox", { name: "Источник" }).first().fill(before.source);
    await page.getByRole("textbox", { name: "Сумма" }).first().fill(before.amount);
    await restore;
  });

  test("375 px: нет горизонтальной прокрутки страницы", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    for (const tab of ["overview", "planner"]) {
      await openAnalytics(page, `?tab=${tab}`);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `вкладка ${tab}`).toBeLessThanOrEqual(0);
    }
  });
});
