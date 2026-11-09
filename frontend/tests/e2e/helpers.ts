import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const API_URL = process.env.PLAYWRIGHT_API_URL ?? "http://127.0.0.1:8100";

export interface ApiTransactionRecord {
  id: string;
  title: string;
  amount_paise: number;
  version: number;
  updated_at: string;
  deleted_at: string | null;
}

export function uniqueTitle(prefix: string): string {
  return `${prefix} ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Waits until React has hydrated the app shell. Server-rendered forms look
 * interactive before hydration, but clicking one early triggers a native form
 * submission instead of the React submit handler.
 */
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(() => document.documentElement.dataset.hydrated === "true", undefined, {
    timeout: 30_000,
  });
}

/**
 * The service worker is only registered in production builds. This helper
 * waits for it to install, then reloads so it controls the current page.
 */
export async function ensureServiceWorker(page: Page): Promise<void> {
  await page.goto("/");
  await page.waitForFunction(
    async () => {
      if (!("serviceWorker" in navigator)) return false;
      const registration = await navigator.serviceWorker.getRegistration();
      return Boolean(registration?.active);
    },
    undefined,
    { timeout: 30_000 },
  );
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), undefined, {
    timeout: 30_000,
  });
}

export async function submitTransactionForm(
  page: Page,
  options: { title: string; amount: string; type?: "expense" | "income" },
): Promise<void> {
  await page.goto("/transactions/new");
  await expect(page.getByRole("heading", { name: "Add transaction" })).toBeVisible();
  await waitForHydration(page);
  await page.getByLabel("Title", { exact: true }).fill(options.title);
  await page.getByLabel("Amount", { exact: true }).fill(options.amount);
  if (options.type === "income") {
    await page.getByRole("button", { name: "Income", exact: true }).click();
  }
  await page.getByRole("button", { name: /Save transaction/i }).click();
  await expect(page.getByText("Transaction saved", { exact: true })).toBeVisible();
}

export async function submitEditForm(
  page: Page,
  id: string,
  options: { title: string; amount?: string },
): Promise<void> {
  await page.goto(`/transactions/edit?id=${id}`);
  await expect(page.getByRole("heading", { name: "Edit transaction" })).toBeVisible();
  await waitForHydration(page);
  const titleInput = page.getByLabel("Title", { exact: true });
  await titleInput.fill(options.title);
  if (options.amount) {
    await page.getByLabel("Amount", { exact: true }).fill(options.amount);
  }
  await page.getByRole("button", { name: /Update transaction/i }).click();
  await expect(page.getByText("Transaction updated", { exact: true })).toBeVisible();
}

export async function waitForSynced(page: Page): Promise<void> {
  await expect(page.getByTitle(/^Synced/)).toBeVisible({ timeout: 30_000 });
}

export async function waitForPending(page: Page): Promise<void> {
  await expect(page.getByTitle(/pending/i)).toBeVisible({ timeout: 15_000 });
}

/**
 * Opens the sync popover only when it is closed. The popover stays open after
 * "Sync now", so an unconditional click would toggle it shut again.
 */
export async function openSyncPanel(page: Page): Promise<void> {
  const trigger = page.locator('button[aria-haspopup="dialog"]');
  if ((await trigger.getAttribute("aria-expanded")) !== "true") {
    await trigger.click();
  }
  await expect(page.getByRole("dialog", { name: "Synchronisation status" })).toBeVisible();
}

export async function waitForApiTransaction(
  request: APIRequestContext,
  title: string,
  timeoutMs = 30_000,
): Promise<ApiTransactionRecord> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await request.get(`${API_URL}/api/transactions`, {
      params: { q: title, limit: "100" },
    });
    if (response.ok()) {
      const data = (await response.json()) as {
        items: ApiTransactionRecord[];
        total: number;
      };
      const match = data.items.find((item) => item.title === title);
      if (match) return match;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for "${title}" on the server`);
}

export async function apiTransactionCount(
  request: APIRequestContext,
  title: string,
): Promise<number> {
  const response = await request.get(`${API_URL}/api/transactions`, {
    params: { q: title, limit: "100" },
  });
  expect(response.ok()).toBe(true);
  const data = (await response.json()) as { total: number };
  return data.total;
}
