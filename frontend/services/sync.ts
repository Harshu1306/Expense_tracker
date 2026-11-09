"use client";

import { db, getMeta, setMeta } from "@/services/db";
import {
  api,
  fromApiBudget,
  fromApiTransaction,
  toApiBudget,
  toApiTransaction,
} from "@/services/api";
import {
  dueOperations,
  enqueueOperation,
  failOperation,
  failedOperationCount,
  markInFlight,
  pendingOperationCount,
  rescheduleOperation,
} from "@/services/queue";
import type { ApiSyncOperation, ApiSyncResult, ApiTransaction, ApiBudget } from "@/types/api";
import type {
  ConflictRecord,
  LocalBudget,
  LocalTransaction,
  SyncEntity,
  SyncOpType,
  SyncQueueItem,
} from "@/types";
import { nowISO } from "@/lib/dates";
import { uuid } from "@/lib/utils";

export type SyncState = "online" | "offline" | "syncing" | "synced" | "failed";

export interface SyncSnapshot {
  online: boolean;
  state: SyncState;
  pendingCount: number;
  failedCount: number;
  conflictCount: number;
  lastSyncedAt: string | null;
  lastPulledAt: string | null;
  lastError: string | null;
}

const SERVER_SNAPSHOT: SyncSnapshot = {
  online: true,
  state: "synced",
  pendingCount: 0,
  failedCount: 0,
  conflictCount: 0,
  lastSyncedAt: null,
  lastPulledAt: null,
  lastError: null,
};

function detectOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

let snapshot: SyncSnapshot = {
  ...SERVER_SNAPSHOT,
  online: detectOnline(),
  state: detectOnline() ? "synced" : "offline",
};

const listeners = new Set<() => void>();

export function getSyncSnapshot(): SyncSnapshot {
  return snapshot;
}

export function getServerSyncSnapshot(): SyncSnapshot {
  return SERVER_SNAPSHOT;
}

export function subscribeSync(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function updateSnapshot(patch: Partial<SyncSnapshot>): void {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((listener) => listener());
}

export async function refreshCounters(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const [pendingCount, failedCount, conflictCount, lastSyncedAt, lastPulledAt] =
      await Promise.all([
        pendingOperationCount(),
        failedOperationCount(),
        db.conflicts.filter((conflict) => conflict.resolved === 0).count(),
        getMeta("lastSyncedAt"),
        getMeta("lastPulledAt"),
      ]);
    updateSnapshot({
      pendingCount,
      failedCount,
      conflictCount,
      lastSyncedAt,
      lastPulledAt,
      online: detectOnline(),
      state:
        !detectOnline()
          ? "offline"
          : snapshot.state === "syncing"
            ? "syncing"
            : snapshot.state === "failed" && pendingCount > 0
              ? "failed"
              : pendingCount > 0
                ? snapshot.state === "offline"
                  ? "synced"
                  : snapshot.state
                : snapshot.state === "failed" && !snapshot.lastError
                  ? "synced"
                  : snapshot.state,
    });
  } catch {
    // IndexedDB may be unavailable in private mode; the UI stays usable.
  }
}

// ---------------------------------------------------------------------------
// Result application
// ---------------------------------------------------------------------------
async function applyServerRecord(
  entity: SyncEntity,
  record: Record<string, unknown>,
  clean: boolean,
  conflictFlag = false,
): Promise<void> {
  if (entity === "transaction") {
    const mapped = fromApiTransaction(record as unknown as ApiTransaction);
    const local = await db.transactions.get(mapped.id);
    if (clean) {
      await db.transactions.put({
        ...mapped,
        syncState: conflictFlag ? "conflict" : "synced",
      });
    } else if (local) {
      // Keep pending local fields, but adopt the server version so the next
      // queued operation sends the correct base_version.
      await db.transactions.update(mapped.id, {
        version: mapped.version,
        syncState: local.syncState === "conflict" ? "conflict" : "pending",
      });
    }
  } else {
    const mapped = fromApiBudget(record as unknown as ApiBudget);
    const local = await db.budgets.get(mapped.id);
    if (clean) {
      await db.budgets.put({
        ...mapped,
        syncState: conflictFlag ? "conflict" : "synced",
      });
    } else if (local) {
      await db.budgets.update(mapped.id, {
        version: mapped.version,
        syncState: local.syncState === "conflict" ? "conflict" : "pending",
      });
    }
  }
}

async function markDeletedSynced(entity: SyncEntity, entityId: string): Promise<void> {
  if (entity === "transaction") {
    await db.transactions.update(entityId, { syncState: "synced" });
  } else {
    await db.budgets.update(entityId, { syncState: "synced" });
  }
}

async function processResult(op: SyncQueueItem, result: ApiSyncResult): Promise<void> {
  await db.transaction(
    "rw",
    [db.transactions, db.budgets, db.syncQueue, db.conflicts],
    async () => {
      const current = await db.syncQueue.get(op.seq);
      // The operation may have been superseded (e.g. a delete coalesced while
      // the request was in flight).  In that case a newer op owns the entity.
      if (!current) return;

      const remaining = await db.syncQueue
        .where("entityId")
        .equals(op.entityId)
        .and((item) => item.seq !== op.seq)
        .count();

      if (result.status === "error") {
        await failOperation(op, result.message ?? "Server rejected the operation");
        return;
      }

      await db.syncQueue.delete(op.seq);

      if (result.status === "conflict") {
        const conflict: ConflictRecord = {
          entity: op.entity,
          entityId: op.entityId,
          operationId: op.operationId,
          opType: op.opType,
          localPayload: op.payload,
          serverRecord: result.record ?? {},
          detectedAt: nowISO(),
          resolved: 0,
        };
        await db.conflicts.add(conflict);
        if (result.record) {
          await applyServerRecord(op.entity, result.record, remaining === 0, true);
        }
        return;
      }

      if (result.status === "not_found") {
        if (op.opType === "UPDATE") {
          // The server lost the row (fresh database / hard reset).  Recreate
          // it from the local copy rather than losing the user's edit.
          await recreateFromLocal(op);
        }
        return;
      }

      // applied | duplicate | ignored
      if (result.record) {
        await applyServerRecord(op.entity, result.record, remaining === 0);
      } else if (op.opType === "DELETE") {
        await markDeletedSynced(op.entity, op.entityId);
      }
    },
  );
}

async function recreateFromLocal(op: SyncQueueItem): Promise<void> {
  const timestamp = nowISO();
  if (op.entity === "transaction") {
    const local = await db.transactions.get(op.entityId);
    if (!local) return;
    const updated: LocalTransaction = {
      ...local,
      updatedAt: timestamp,
      version: 0,
      syncState: "pending",
    };
    await db.transactions.put(updated);
    await enqueueOperation({
      entity: "transaction",
      opType: "CREATE",
      entityId: updated.id,
      payload: toApiTransaction(updated) as unknown as Record<string, unknown>,
      baseVersion: 0,
      clientTimestamp: timestamp,
    });
  } else {
    const local = await db.budgets.get(op.entityId);
    if (!local) return;
    const updated: LocalBudget = {
      ...local,
      updatedAt: timestamp,
      version: 0,
      syncState: "pending",
    };
    await db.budgets.put(updated);
    await enqueueOperation({
      entity: "budget",
      opType: "CREATE",
      entityId: updated.id,
      payload: toApiBudget(updated) as unknown as Record<string, unknown>,
      baseVersion: 0,
      clientTimestamp: timestamp,
    });
  }
}

function toApiOperation(item: SyncQueueItem): ApiSyncOperation {
  return {
    operation_id: item.operationId,
    entity: item.entity,
    op_type: item.opType,
    entity_id: item.entityId,
    payload: item.payload,
    base_version: item.baseVersion,
    client_timestamp: item.clientTimestamp,
  };
}

// ---------------------------------------------------------------------------
// Pull
// ---------------------------------------------------------------------------
async function mergeChanges(transactions: ApiTransaction[], budgets: ApiBudget[]): Promise<void> {
  await db.transaction("rw", [db.transactions, db.budgets, db.syncQueue], async () => {
    const pending = await db.syncQueue.toArray();
    const pendingIds = new Set(pending.map((item) => item.entityId));

    for (const apiTransaction of transactions) {
      if (pendingIds.has(apiTransaction.id)) continue;
      const local = await db.transactions.get(apiTransaction.id);
      if (local?.syncState === "pending") continue;
      if (local && Date.parse(local.updatedAt) > Date.parse(apiTransaction.updated_at)) continue;
      const mapped = fromApiTransaction(apiTransaction);
      const keepConflict =
        local?.syncState === "conflict" && local.updatedAt === apiTransaction.updated_at;
      await db.transactions.put({
        ...mapped,
        syncState: keepConflict ? "conflict" : "synced",
      });
    }

    for (const apiBudget of budgets) {
      if (pendingIds.has(apiBudget.id)) continue;
      const local = await db.budgets.get(apiBudget.id);
      if (local?.syncState === "pending") continue;
      if (local && Date.parse(local.updatedAt) > Date.parse(apiBudget.updated_at)) continue;
      const mapped = fromApiBudget(apiBudget);
      const keepConflict =
        local?.syncState === "conflict" && local.updatedAt === apiBudget.updated_at;
      await db.budgets.put({
        ...mapped,
        syncState: keepConflict ? "conflict" : "synced",
      });
    }
  });
}

async function pullChanges(): Promise<void> {
  let cursor = await getMeta("lastPulledAt");
  let pages = 0;

  while (pages < 20) {
    const data = await api.changes(cursor ?? undefined, 1000);
    await mergeChanges(data.transactions, data.budgets);
    pages += 1;

    if (!data.has_more) {
      await setMeta("lastPulledAt", data.server_time);
      updateSnapshot({ lastPulledAt: data.server_time });
      return;
    }

    const stamps = [
      ...data.transactions.map((item) => item.updated_at),
      ...data.budgets.map((item) => item.updated_at),
    ].sort();
    if (stamps.length === 0) {
      await setMeta("lastPulledAt", data.server_time);
      updateSnapshot({ lastPulledAt: data.server_time });
      return;
    }
    cursor = stamps[stamps.length - 1];
  }
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------
let running: Promise<void> | null = null;
let rerunRequested = false;
let started = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let intervalTimer: ReturnType<typeof setInterval> | null = null;

async function runSync(options: { manual?: boolean } = {}): Promise<void> {
  if (typeof window === "undefined") return;
  if (!navigator.onLine) {
    updateSnapshot({ online: false, state: "offline" });
    await refreshCounters();
    return;
  }
  if (running) {
    rerunRequested = true;
    return running;
  }

  running = (async () => {
    updateSnapshot({ online: true, state: "syncing", lastError: null });
    const attempted = new Set<string>();

    try {
      for (let batch = 0; batch < 12; batch += 1) {
        const ops = await dueOperations({
          manual: options.manual,
          exclude: attempted,
        });
        if (ops.length === 0) break;
        ops.forEach((op) => attempted.add(op.operationId));
        await markInFlight(ops);

        let response;
        try {
          response = await api.sync(ops.map(toApiOperation));
        } catch (error) {
          const message = error instanceof Error ? error.message : "Sync failed";
          for (const op of ops) await rescheduleOperation(op, message);
          updateSnapshot({ state: "failed", lastError: message });
          await refreshCounters();
          scheduleRetry();
          return;
        }

        for (const op of ops) {
          const result = response.results.find(
            (candidate) => candidate.operation_id === op.operationId,
          );
          if (!result) {
            await rescheduleOperation(op, "The server did not return a result");
            continue;
          }
          await processResult(op, result);
        }
        await refreshCounters();
      }

      await refreshCounters();

      if (snapshot.pendingCount === 0) {
        try {
          await pullChanges();
          const syncedAt = nowISO();
          await setMeta("lastSyncedAt", syncedAt);
          updateSnapshot({ state: "synced", lastSyncedAt: syncedAt, lastError: null });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Could not refresh server data";
          updateSnapshot({ state: "failed", lastError: message });
          scheduleRetry();
        }
      } else if (snapshot.failedCount > 0) {
        updateSnapshot({
          state: "failed",
          lastError: "Some changes need attention. Retry from Settings.",
        });
      } else {
        updateSnapshot({ state: "synced", lastError: null });
        scheduleRetry();
      }
    } finally {
      running = null;
      await refreshCounters();
      if (rerunRequested) {
        rerunRequested = false;
        requestSync(50);
      }
    }
  })();

  return running;
}

function scheduleRetry(): void {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  if (typeof window === "undefined" || !navigator.onLine) return;
  void (async () => {
    const pending = await db.syncQueue.where("status").equals("pending").toArray();
    const next = pending
      .map((item) => item.nextRetryAt)
      .filter((value) => value > Date.now())
      .sort((a, b) => a - b)[0];
    if (!next) return;
    retryTimer = setTimeout(() => {
      void runSync();
    }, Math.max(1_000, next - Date.now() + 250));
  })();
}

/** Debounced auto-sync, used after every local mutation. */
export function requestSync(delay = 350): void {
  if (typeof window === "undefined") return;
  if (!navigator.onLine) {
    updateSnapshot({ online: false, state: "offline" });
    return;
  }
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    void runSync();
  }, delay);
}

export function notifyLocalMutation(): void {
  void refreshCounters();
  requestSync(250);
}

export async function syncNow(): Promise<void> {
  await runSync({ manual: true });
}

export async function retryAndSync(): Promise<void> {
  await runSync({ manual: true });
}

function handleOnline(): void {
  updateSnapshot({ online: true, state: "syncing", lastError: null });
  requestSync(0);
}

function handleOffline(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  if (retryTimer) clearTimeout(retryTimer);
  updateSnapshot({ online: false, state: "offline" });
}

function handleVisibility(): void {
  if (document.visibilityState === "visible" && navigator.onLine) {
    requestSync(100);
  }
}

export function startSyncEngine(): () => void {
  if (typeof window === "undefined" || started) return () => undefined;
  started = true;

  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);
  document.addEventListener("visibilitychange", handleVisibility);
  intervalTimer = setInterval(() => {
    if (navigator.onLine) void runSync();
  }, 30_000);

  void (async () => {
    const [lastSyncedAt, lastPulledAt] = await Promise.all([
      getMeta("lastSyncedAt"),
      getMeta("lastPulledAt"),
    ]);
    updateSnapshot({
      online: navigator.onLine,
      state: navigator.onLine ? "synced" : "offline",
      lastSyncedAt,
      lastPulledAt,
    });
    await refreshCounters();
    if (navigator.onLine) requestSync(0);
  })();

  return () => {
    started = false;
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
    document.removeEventListener("visibilitychange", handleVisibility);
    if (intervalTimer) clearInterval(intervalTimer);
    if (debounceTimer) clearTimeout(debounceTimer);
    if (retryTimer) clearTimeout(retryTimer);
    intervalTimer = null;
    debounceTimer = null;
    retryTimer = null;
  };
}

export { uuid };
