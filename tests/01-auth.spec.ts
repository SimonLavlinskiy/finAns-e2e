import { test, expect } from "@playwright/test";
import { loginAs, loginAndSelectProject, SIMON_PASSWORD, ANNA_PASSWORD } from "./helpers";

// TC-01-01 · Успешный вход (simon)
test("TC-01-01: успешный вход simon → /projects → /transactions", async ({ page }) => {
  await loginAs(page, "simon", SIMON_PASSWORD);
  await expect(page).toHaveURL(/\/projects/);
  await page.click("text=Мои финансы");
  await expect(page).toHaveURL(/\/transactions/);
  await expect(page.locator("text=@simon")).toBeVisible();
  await expect(page.locator('[data-testid="btn-logout"]')).toBeVisible();
});

// TC-01-02 · Успешный вход (anna) — нет пункта «Пользователи»
test("TC-01-02: anna не видит пункт «Пользователи» в навигации", async ({ page }) => {
  await loginAndSelectProject(page, "anna", ANNA_PASSWORD);
  await expect(page.locator('[data-testid="sidebar-nav"]')).not.toContainText("Пользователи");
});

// TC-01-03 · Неверный пароль
test("TC-01-03: неверный пароль → сообщение об ошибке, остаётся на /login", async ({ page }) => {
  await loginAs(page, "simon", "wrongpassword");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.locator("text=Неверный логин или пароль")).toBeVisible();
});

// TC-01-04 · Несуществующий пользователь
test("TC-01-04: несуществующий пользователь → ошибка", async ({ page }) => {
  await loginAs(page, "ghost", "anything");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.locator("text=Неверный логин или пароль")).toBeVisible();
});

// TC-01-05 · Пустые поля — кнопка неактивна
test("TC-01-05: пустые поля → кнопка «Войти» задизейблена", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator('button:has-text("Войти")')).toBeDisabled();
});

// TC-01-06 · Выход из аккаунта
test("TC-01-06: выход → редирект на /login, защита маршрутов работает", async ({ page }) => {
  await loginAndSelectProject(page, "simon", SIMON_PASSWORD);
  await page.click('[data-testid="btn-logout"]');
  await expect(page).toHaveURL(/\/login/);

  await page.goto("/transactions");
  await expect(page).toHaveURL(/\/login/);
});

// TC-01-07 · Защита маршрутов без авторизации
test("TC-01-07: переход на /transactions без auth → редирект на /login", async ({ page }) => {
  await page.evaluate(() => localStorage.clear());
  await page.goto("/transactions");
  await expect(page).toHaveURL(/\/login/);
});

// TC-01-08 · Есть userId, нет projectId → /projects
test("TC-01-08: userId есть, projectId нет → редирект на /projects", async ({ page }) => {
  // Логинимся, но не выбираем проект
  await loginAs(page, "simon", SIMON_PASSWORD);
  await expect(page).toHaveURL(/\/projects/);
  // Пробуем перейти напрямую без выбора проекта
  await page.goto("/transactions");
  await expect(page).toHaveURL(/\/projects/);
});

// TC-01-09 · Сессия сохраняется после обновления страницы
test("TC-01-09: сессия сохраняется после F5", async ({ page }) => {
  await loginAndSelectProject(page, "simon", SIMON_PASSWORD);
  await page.reload();
  await expect(page).toHaveURL(/\/transactions/);
  await expect(page.locator("text=@simon")).toBeVisible();
});

// TC-01-10 · Simon может создать пользователя
test("TC-01-10: simon создаёт нового пользователя", async ({ page }) => {
  await loginAndSelectProject(page, "simon", SIMON_PASSWORD);
  await page.goto("/admin/users");

  const rand = Date.now().toString().slice(-5);
  await page.fill('[placeholder="Логин (@username)"]', `testuser${rand}`);
  await page.fill('[placeholder="Имя (отображаемое)"]', "Test User");
  await page.fill('[placeholder="Пароль"]', "testpass123");
  await page.click('button:has-text("Создать")');

  await expect(page.locator(`text=@testuser${rand}`)).toBeVisible();
});

// TC-01-11 · Anna не может создать пользователя (403)
test("TC-01-11: anna не видит пункт «Пользователи», POST /users возвращает 403", async ({ page }) => {
  await loginAndSelectProject(page, "anna", ANNA_PASSWORD);

  // Пункта в навигации нет
  await expect(page.locator('[data-testid="sidebar-nav"]')).not.toContainText("Пользователи");

  // API-вызов возвращает 403
  const response = await page.request.post("/api/v1/users", {
    headers: { "X-User-ID": "1", "Content-Type": "application/json" },
    data: { username: "hack", display_name: "Hack", password: "hacked" },
  });
  expect(response.status()).toBe(403);
});
