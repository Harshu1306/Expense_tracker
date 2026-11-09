"use client";

import Dexie, { type Table } from "dexie";
import type {
  ConflictRecord,
  LocalBudget,
  LocalTransaction,
  MetaEntry,
  SyncQueueItem,
} from "@/types";

/**
 * Local-first database. IndexedDB is the source of truth for the UI; the
 * FastAPI server is a synchronisation target, never a prerequisite.
 */
class SpendWiseDB extends Dexie {
  transactions!: Table<LocalTransaction, string>;
  budgets!: Table<LocalBudget, string>;
  syncQueue!: Table<SyncQueueItem, number>;
  meta!: Table<MetaEntry, string>;
  conflicts!: Table<ConflictRecord, number>;

  constructor() {
    super("spendwise");
    this.version(1).stores({
      transactions: "id, date, category, type, updatedAt, deletedAt, syncState",
      budgets: "id, month, year, category, updatedAt, deletedAt, syncState, [month+year]",
      syncQueue: "++seq, &operationId, entity, entityId, status, nextRetryAt",
      meta: "key",
      conflicts: "++id, entityId, detectedAt, resolved",
    });
  }
}

export const db = new SpendWiseDB();

export async function getMeta(key: string): Promise<string | null> {
  const entry = await db.meta.get(key);
  return entry?.value ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await db.meta.put({ key, value });
}

export async function clearMeta(key: string): Promise<void> {
  await db.meta.delete(key);
}

/** Wipe every local table. Server data is intentionally untouched. */
export async function clearLocalData(): Promise<void> {
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
}

export async function localCounts(): Promise<{
  transactions: number;
  budgets: number;
  queued: number;
  conflicts: number;
}> {
  const [transactions, budgets, queued, conflicts] = await Promise.all([
    db.transactions.filter((tx) => tx.deletedAt === null).count(),
    db.budgets.filter((budget) => budget.deletedAt === null).count(),
    db.syncQueue.count(),
    db.conflicts.filter((conflict) => conflict.resolved === 0).count(),
  ]);
  return { transactions, budgets, queued, conflicts };
}
