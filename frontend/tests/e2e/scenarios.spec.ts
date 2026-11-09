import { expect, test } from "@playwright/test";
import {
  API_URL,
  apiTransactionCount,
  ensureServiceWorker,
  openSyncPanel,
  submitEditForm,
  submitTransactionForm,
  uniqueTitle,
  waitForApiTransaction,
  waitForPending,
  waitForSynced,
} from "./helpers";

test.describe.configure({ mode: "serial" });

test("Scenario A — online create, dashboard update, refresh persistence and server sync", async ({
  page,
  request,
}) => {
  const title = uniqueTitle("E2E A online");

  await submitTransactionForm(page, { title, amount: "1234.56" });
  await page.goto("/transactions");
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await expect(page.getByText("₹1,234.56", { exact: false }).first()).toBeVisible();

  await waitForSynced(page);
  const server = await waitForApiTransaction(request, title);
  expect(server.amount_paise).toBe(123456);

  // A browser refresh must restore the entry from IndexedDB.
  await page.reload();
  await expect(page.getByText(title, { exact: true })).toBeVisible();

  // The dashboard derives its totals from the same local database.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
});

test("Scenario B — offline create survives an offline reload and syncs on reconnect", async ({
  page,
  request,
}) => {
  await ensureServiceWorker(page);
  const title = uniqueTitle("E2E B offline");

  await page.context().setOffline(true);
  await expect(page.getByText(/You're offline/).first()).toBeVisible();

  await submitTransactionForm(page, { title, amount: "89.50", type: "expense" });
  await waitForPending(page);

  await page.goto("/transactions");
  await expect(page.getByText(title, { exact: true })).toBeVisible();

  // Full reload while still offline: the service worker serves the cached shell.
  await page.reload();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await expect(page.getByText(/You're offline/).first()).toBeVisible();

  await page.context().setOffline(false);
  const server = await waitForApiTransaction(request, title);
  expect(server.amount_paise).toBe(8950);
  await waitForSynced(page);
});

test("Scenario C — offline delete is queued as a tombstone and syncs", async ({
  page,
  request,
}) => {
  const title = uniqueTitle("E2E C tombstone");

  await submitTransactionForm(page, { title, amount: "42" });
  await page.goto("/transactions");
  await waitForSynced(page);
  await waitForApiTransaction(request, title);

  await page.context().setOffline(true);
  await page.getByRole("button", { name: `Delete ${title}` }).click();
  await page.getByRole("button", { name: "Delete transaction", exact: true }).click();
  await expect(page.getByText("Transaction deleted", { exact: true })).toBeVisible();
  await expect(page.getByText(title, { exact: true })).toHaveCount(0);
  await waitForPending(page);

  await page.context().setOffline(false);
  await waitForSynced(page);

  await expect
    .poll(
      async () => {
        const response = await request.get(
          `${API_URL}/api/transactions?q=${encodeURIComponent(title)}&include_deleted=true&limit=100`,
        );
        const data = (await response.json()) as {
          items: Array<{ title: string; deleted_at: string | null }>;
        };
        return data.items.find((item) => item.title === title)?.deleted_at ?? null;
      },
      { timeout: 30_000 },
    )
    .not.toBeNull();
});

test("Scenario D — retries reuse the operation UUID and never duplicate a record", async ({
  page,
  request,
}) => {
  const title = uniqueTitle("E2E D retry");

  await ensureServiceWorker(page);
  await page.context().setOffline(true);
  await submitTransactionForm(page, { title, amount: "315.25" });
  await waitForPending(page);

  // Fail the first upload after reconnecting, then let the manual retry through.
  await page.route("**/api/sync", (route) => route.abort("failed"));
  await page.context().setOffline(false);
  await expect(page.getByTitle(/^Sync failed/)).toBeVisible({ timeout: 30_000 });

  await page.unroute("**/api/sync");
  await openSyncPanel(page);
  await page.getByRole("button", { name: "Sync now", exact: true }).click();

  await waitForApiTransaction(request, title);
  expect(await apiTransactionCount(request, title)).toBe(1);

  // Extra manual syncs must not create duplicates.
  await waitForSynced(page);
  await openSyncPanel(page);
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  await page.waitForTimeout(1_000);
  expect(await apiTransactionCount(request, title)).toBe(1);
});

test("Scenario E — a conflicting edit is surfaced and can be reapplied", async ({
  page,
  request,
}) => {
  const title = uniqueTitle("E2E E conflict");
  const localTitle = `${title} local`;
  const serverTitle = `${title} server`;

  await ensureServiceWorker(page);
  await submitTransactionForm(page, { title, amount: "500" });
  await page.goto("/transactions");
  await waitForSynced(page);
  const serverRecord = await waitForApiTransaction(request, title);

  // Edit locally while offline.
  await page.context().setOffline(true);
  await submitEditForm(page, serverRecord.id, { title: localTitle });
  await waitForPending(page);

  // A different device wins the race by writing a newer server version.
  const serverUpdate = await request.put(
    `${API_URL}/api/transactions/${serverRecord.id}`,
    {
      data: {
        title: serverTitle,
        updated_at: new Date().toISOString(),
        base_version: serverRecord.version,
      },
    },
  );
  expect(serverUpdate.ok()).toBe(true);

  await page.context().setOffline(false);
  await expect(page.getByText(/conflict.*review/i).first()).toBeVisible({
    timeout: 30_000,
  });

  await page.goto("/settings#conflicts");
  await expect(page.getByRole("heading", { name: "Sync conflicts" })).toBeVisible();
  await expect(page.getByText("Your change", { exact: true })).toBeVisible();
  await expect(page.getByText("Server version", { exact: true })).toBeVisible();
  await expect(page.getByText(serverTitle, { exact: false }).first()).toBeVisible();

  await page.getByRole("button", { name: "Reapply mine", exact: true }).click();
  await expect(page.getByText("Your change re-queued", { exact: true })).toBeVisible();

  const reapplied = await waitForApiTransaction(request, localTitle);
  expect(reapplied.title).toBe(localTitle);
});
