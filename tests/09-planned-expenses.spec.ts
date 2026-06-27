import { test, expect } from "@playwright/test";

// All tests run with simon's storageState (selected project already set via global-setup)

test.beforeEach(async ({ page }) => {
  await page.goto("/planned-expenses");
  await page.waitForLoadState("networkidle");
});

// TC-09-01 · Отображение доски категорий
test("TC-09-01: страница /planned-expenses содержит блоки категорий", async ({ page }) => {
  await expect(page.locator("text=+ Добавить категорию")).toBeVisible();
});

// TC-09-02 · Создание категории
test("TC-09-02: создание категории «Электроника»", async ({ page }) => {
  await page.click("text=+ Добавить категорию");
  await page.fill('input[placeholder*="Название"]', "Электроника");
  // Выбираем первый цвет из палитры
  await page.locator('[data-testid="color-picker"] button').first().click();
  await page.click('button:has-text("Сохранить")');

  await expect(page.locator("text=Электроника")).toBeVisible();
});

// TC-09-03 · Добавление позиции в категорию
test("TC-09-03: добавление позиции AirPods Pro в категорию", async ({ page }) => {
  // Создаём категорию для теста
  await page.click("text=+ Добавить категорию");
  await page.fill('input[placeholder*="Название"]', `Тест ${Date.now()}`);
  await page.click('button:has-text("Сохранить")');

  // Добавляем позицию
  await page.click('button:has-text("+ Добавить")');
  await page.fill('input[placeholder*="Название"]', "AirPods Pro");
  await page.fill('input[placeholder*="Стоимость"]', "24990");

  // Приоритет high
  const priorityBtn = page.locator('button:has-text("Высокий"), [value="high"]').first();
  await priorityBtn.click();

  await page.click('button:has-text("Сохранить")');

  await expect(page.locator("text=AirPods Pro")).toBeVisible();
  await expect(page.locator("text=24 990")).toBeVisible();
});

// TC-09-04 · Сортировка позиций по приоритету
test("TC-09-04: позиции сортируются high → medium → low", async ({ page }) => {
  // Проверяем порядок через порядок DOM-элементов с приоритетами
  // Если есть карточки с приоритетами — high должен быть выше low
  const cards = page.locator('[data-testid^="planned-expense-card"]');
  const count = await cards.count();
  if (count < 2) {
    test.skip();
    return;
  }

  // Первая карточка должна иметь приоритет не ниже второй
  const firstPriority = await cards.first().getAttribute("data-priority");
  const lastPriority = await cards.last().getAttribute("data-priority");
  const priorityOrder = ["high", "medium", "low"];

  if (firstPriority && lastPriority) {
    expect(priorityOrder.indexOf(firstPriority)).toBeLessThanOrEqual(
      priorityOrder.indexOf(lastPriority)
    );
  }
});

// TC-09-05 · Отметить позицию «Выполнено» — диалог с суммой и меткой
test("TC-09-05: нажать «Выполнено» → диалог открывается", async ({ page }) => {
  const doneBtn = page.locator('button:has-text("Выполнено")').first();
  const hasDone = await doneBtn.count();
  if (hasDone === 0) {
    test.skip();
    return;
  }

  await doneBtn.click();
  await expect(page.locator('[role="dialog"]')).toBeVisible();
  await expect(page.locator('button:has-text("Создать транзакцию")')).toBeVisible();
  await expect(page.locator('button:has-text("В архив")')).toBeVisible();
});

// TC-09-06 · «В архив» без создания транзакции
test("TC-09-06: «В архив» — транзакция не создаётся", async ({ page }) => {
  const doneBtn = page.locator('button:has-text("Выполнено")').first();
  if (await doneBtn.count() === 0) {
    test.skip();
    return;
  }

  await doneBtn.click();
  await page.waitForSelector('[role="dialog"]');

  // Перехватываем запросы транзакций
  let transactionCreated = false;
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().includes("/transactions")) {
      transactionCreated = true;
    }
  });

  await page.click('button:has-text("В архив")');
  await expect(page.locator('[role="dialog"]')).not.toBeVisible();
  expect(transactionCreated).toBe(false);
});

// TC-09-07 · «Создать транзакцию» недоступна без метки
test("TC-09-07: кнопка «Создать транзакцию» дизейблена без выбора метки", async ({ page }) => {
  const doneBtn = page.locator('button:has-text("Выполнено")').first();
  if (await doneBtn.count() === 0) {
    test.skip();
    return;
  }

  await doneBtn.click();
  await page.waitForSelector('[role="dialog"]');

  // Без выбора метки кнопка должна быть дизейблена
  await expect(page.locator('button:has-text("Создать транзакцию")')).toBeDisabled();
});

// TC-09-08 · Drag & Drop блоков категорий — нет ошибок в консоли
test("TC-09-08: DnD категорий — нет ошибки r.map is not a function", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  const categories = page.locator('[data-testid^="category-block"]');
  const count = await categories.count();
  if (count < 2) {
    test.skip();
    return;
  }

  const source = categories.nth(0);
  const target = categories.nth(1);

  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) {
    test.skip();
    return;
  }

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(500);

  const mapErrors = errors.filter((e) => e.includes("map is not a function"));
  expect(mapErrors).toHaveLength(0);
});

// TC-09-09 · Редактирование позиции
test("TC-09-09: редактирование позиции — название обновляется", async ({ page }) => {
  const menuBtn = page.locator('[data-testid="planned-expense-menu"]').first();
  if (await menuBtn.count() === 0) {
    test.skip();
    return;
  }

  await menuBtn.click();
  await page.click('text=Редактировать');

  const nameInput = page.locator('input[placeholder*="Название"]').first();
  await nameInput.clear();
  const newName = `Обновлено ${Date.now()}`;
  await nameInput.fill(newName);

  await page.click('button:has-text("Сохранить")');
  await expect(page.locator(`text=${newName}`)).toBeVisible();
});

// TC-09-10 · Удаление позиции
test("TC-09-10: удаление позиции — карточка исчезает", async ({ page }) => {
  // Создаём позицию специально для удаления
  await page.click('button:has-text("+ Добавить")');
  const tempName = `Удалить ${Date.now()}`;
  await page.fill('input[placeholder*="Название"]', tempName);
  await page.fill('input[placeholder*="Стоимость"]', "100");
  await page.click('button:has-text("Сохранить")');
  await expect(page.locator(`text=${tempName}`)).toBeVisible();

  // Удаляем
  const card = page.locator(`text=${tempName}`).locator("..").locator("..");
  await card.locator('[data-testid="planned-expense-menu"]').click();
  await page.click('text=Удалить');
  // Подтверждение, если есть диалог
  const confirmBtn = page.locator('button:has-text("Удалить"), button:has-text("Подтвердить")').last();
  if (await confirmBtn.count()) await confirmBtn.click();

  await expect(page.locator(`text=${tempName}`)).not.toBeVisible();
});

// TC-09-11 · Пустое состояние — нет категорий → заглушка
test("TC-09-11: если нет категорий — отображается заглушка", async ({ page }) => {
  const categories = page.locator('[data-testid^="category-block"]');
  const count = await categories.count();
  if (count > 0) {
    test.skip(); // пропустить если есть категории
    return;
  }

  // Проверяем текст-заглушку
  const empty = page.locator("text=Добавьте первую категорию, [data-testid='empty-categories']");
  await expect(empty).toBeVisible();
});
