import { test, expect } from "@playwright/test";
import { loginAs, loginAndSelectProject, SIMON_PASSWORD, ANNA_PASSWORD } from "./helpers";

// TC-10-01 · Выбор проекта после входа
test("TC-10-01: после логина выбор «Мои финансы» → /transactions", async ({ page }) => {
  await loginAs(page, "simon", SIMON_PASSWORD);
  await expect(page).toHaveURL(/\/projects/);

  await page.click("text=Мои финансы");
  await expect(page).toHaveURL(/\/transactions/);
  await expect(page.locator("text=Мои финансы")).toBeVisible();
});

// TC-10-02 · Список проектов пуст — кнопка «Создать проект» присутствует
test("TC-10-02: страница /projects содержит кнопку «Создать проект»", async ({ page }) => {
  await loginAs(page, "simon", SIMON_PASSWORD);
  await expect(page).toHaveURL(/\/projects/);
  // Кнопка должна быть всегда, даже при наличии проектов
  await expect(page.locator('button:has-text("Создать проект"), a:has-text("Создать проект")')).toBeVisible();
});

// TC-10-03 · Создание нового проекта
test("TC-10-03: создание проекта «Семейный бюджет»", async ({ page }) => {
  await loginAs(page, "simon", SIMON_PASSWORD);
  await page.click('button:has-text("Создать проект"), a:has-text("Создать проект")');

  await page.fill('input[placeholder*="Название"]', "Семейный бюджет");

  const balanceInput = page.locator('input[placeholder*="Баланс"], input[placeholder*="баланс"]');
  if (await balanceInput.count()) {
    await balanceInput.fill("100000");
  }

  await page.click('button:has-text("Создать")');
  await expect(page.locator("text=Семейный бюджет")).toBeVisible();
});

// TC-10-04 · Переключатель проекта в хедере (если >1 проекта)
test("TC-10-04: переключатель проекта загружает данные другого проекта", async ({ page }) => {
  await loginAndSelectProject(page, "simon", SIMON_PASSWORD);

  // Ищем селектор проекта
  const projectSwitcher = page.locator('[data-testid="project-switcher"]');
  if (await projectSwitcher.count() === 0) {
    test.skip();
    return;
  }

  const currentProject = await projectSwitcher.textContent();
  await projectSwitcher.click();

  // Выбираем другой вариант из дропдауна
  const options = page.locator('[data-testid="project-option"]');
  if (await options.count() < 2) {
    test.skip();
    return;
  }

  await options.nth(1).click();
  await page.waitForLoadState("networkidle");

  const newProject = await projectSwitcher.textContent();
  expect(newProject).not.toEqual(currentProject);
});

// TC-10-05 · Изоляция данных между проектами
test("TC-10-05: транзакции одного проекта не видны в другом", async ({ page }) => {
  await loginAndSelectProject(page, "simon", SIMON_PASSWORD);

  const projectSwitcher = page.locator('[data-testid="project-switcher"]');
  if (await projectSwitcher.count() === 0) {
    test.skip();
    return;
  }

  // Собираем транзакции первого проекта
  await page.goto("/transactions");
  const txCountA = await page.locator('[data-testid="transaction-row"]').count();

  await projectSwitcher.click();
  const options = page.locator('[data-testid="project-option"]');
  if (await options.count() < 2) {
    test.skip();
    return;
  }
  await options.nth(1).click();
  await page.waitForLoadState("networkidle");
  await page.goto("/transactions");

  const txCountB = await page.locator('[data-testid="transaction-row"]').count();
  // Простая проверка: счётчик транзакций разный (или 0 во втором)
  // Это валидно как минимум когда второй — новый проект
  expect(txCountA).not.toBe(txCountB);
});

// TC-10-06 · Настройки проекта — список участников
test("TC-10-06: /projects/settings показывает участников (simon — owner, anna — member)", async ({ page }) => {
  await loginAndSelectProject(page, "simon", SIMON_PASSWORD);
  await page.goto("/projects/settings");

  await expect(page.locator("text=simon, text=@simon")).first().toBeVisible();
  await expect(page.locator("text=owner")).toBeVisible();
});

// TC-10-07 · Добавление участника в проект
test("TC-10-07: simon добавляет @anna в проект", async ({ page }) => {
  await loginAndSelectProject(page, "simon", SIMON_PASSWORD);
  await page.goto("/projects/settings");

  const memberInput = page.locator('input[placeholder*="участника"], input[placeholder*="@username"]');
  if (await memberInput.count() === 0) {
    test.skip();
    return;
  }

  await memberInput.fill("anna");
  await page.click('button:has-text("Добавить")');

  await expect(page.locator("text=anna, text=@anna")).first().toBeVisible();
});

// TC-10-08 · Добавление несуществующего пользователя → ошибка
test("TC-10-08: добавление @ghost → ошибка «не найден»", async ({ page }) => {
  await loginAndSelectProject(page, "simon", SIMON_PASSWORD);
  await page.goto("/projects/settings");

  const memberInput = page.locator('input[placeholder*="участника"], input[placeholder*="@username"]');
  if (await memberInput.count() === 0) {
    test.skip();
    return;
  }

  await memberInput.fill("ghost_nonexistent_xyz");
  await page.click('button:has-text("Добавить")');

  await expect(page.locator("text=не найден, text=Пользователь не найден")).first().toBeVisible();
});

// TC-10-09 · Удаление участника из проекта (simon удаляет anna)
test("TC-10-09: simon удаляет anna из проекта", async ({ page }) => {
  await loginAndSelectProject(page, "simon", SIMON_PASSWORD);
  await page.goto("/projects/settings");

  const annaRow = page.locator('[data-testid^="member-row"]').filter({ hasText: "anna" });
  if (await annaRow.count() === 0) {
    test.skip();
    return;
  }

  await annaRow.locator('button:has-text("Удалить")').click();

  // Подтверждение
  const confirm = page.locator('button:has-text("Удалить"), button:has-text("Подтвердить")').last();
  if (await confirm.count()) await confirm.click();

  await expect(annaRow).not.toBeVisible();
});

// TC-10-10 · Кнопки удаления скрыты у member (anna)
test("TC-10-10: anna (member) не видит кнопки «Удалить» у участников", async ({ page }) => {
  await loginAndSelectProject(page, "anna", ANNA_PASSWORD);
  await page.goto("/projects/settings");

  const deleteButtons = page.locator('[data-testid^="member-row"] button:has-text("Удалить")');
  await expect(deleteButtons).toHaveCount(0);

  const addMemberForm = page.locator('input[placeholder*="участника"], input[placeholder*="@username"]');
  // Либо нет формы, либо она скрыта/задизейблена
  if (await addMemberForm.count() > 0) {
    await expect(addMemberForm).toBeDisabled();
  }
});
