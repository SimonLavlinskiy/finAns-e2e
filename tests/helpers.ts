import { Page } from "@playwright/test";

export const SIMON_PASSWORD = process.env.SIMON_PASSWORD ?? "Lavlinskiy02091997";
export const ANNA_PASSWORD = process.env.ANNA_PASSWORD ?? "annapopka123";

export async function loginAs(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.fill('[placeholder="Логин"]', username);
  await page.fill('[placeholder="Пароль"]', password);
  await page.click('button:has-text("Войти")');
}

export async function loginAndSelectProject(page: Page, username: string, password: string) {
  await loginAs(page, username, password);
  await page.waitForURL(/\/projects/);
  await page.click("text=Мои финансы");
  await page.waitForURL(/\/transactions/);
}
