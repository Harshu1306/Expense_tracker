import "fake-indexeddb/auto";
import { beforeEach } from "vitest";
import { db } from "@/services/db";

/**
 * Browser services rely on IndexedDB.  fake-indexeddb gives Vitest a real
 * in-memory implementation, and Dexie's own schema handles the rest.
 */
beforeEach(async () => {
  // Keep every test offline by default so local mutations never schedule a
  // background sync against a real network. Sync tests opt in explicitly.
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => false,
  });

  await db.open();
  await db.transaction(
    "rw",
    [db.transactions, db.budgets, db.syncQueue, db.meta, db.conflicts],
    async () => {
      await Promise.all([
        db.transactions.clear(),
        db.budgets.clear(),
        db.syncQueue.clear(),
        db.meta.clear(),
        db.conflicts.clear(),
      ]);
    },
  );
});
