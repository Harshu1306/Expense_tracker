"use client";

import { db } from "@/services/db";
import type { SyncEntity, SyncOpType, SyncQueueItem } from "@/types";
import { nowISO } from "@/lib/dates";
import { uuid } from "@/lib/utils";

export interface EnqueueInput {
  entity: SyncEntity;
  opType: SyncOpType;
  entityId: string;
  payload: Record<string, unknown>;
  baseVersion: number;
  clientTimestamp?: string;
}

const MAX_ATTEMPTS = 8;

/**
 * Persist an operation in the queue.
 *
 * Coalescing: while an operation has never been attempted, subsequent edits
 * rewrite its payload instead of growing the queue.  Once an operation has
 * been sent, new edits get a fresh operation id so an idempotent replay can
 * never return a stale cached result.
 */
export async function enqueueOperation(input: EnqueueInput): Promise<SyncQueueItem> {
  const clientTimestamp = input.clientTimestamp ?? nowISO();
  let result!: SyncQueueItem;

  await db.transaction("rw", db.syncQueue, async () => {
    const existing = await db.syncQueue.where("entityId").equals(input.entityId).toArray();

    if (input.opType === "DELETE") {
      // Remove unsent creates/updates for this entity; the tombstone wins.
      await db.syncQueue.where("entityId").equals(input.entityId).delete();
      result = await addItem(input, clientTimestamp);
      return;
    }

    if (input.opType === "UPDATE") {
      const coalescable = existing.find(
        (item) =>
          item.status === "pending" &&
          item.attempts === 0 &&
          (item.opType === "CREATE" || item.opType === "UPDATE"),
      );
      if (coalescable) {
        await db.syncQueue.update(coalescable.seq, {
          payload: input.payload,
          clientTimestamp,
          lastError: null,
          nextRetryAt: 0,
        });
        result = {
          ...coalescable,
          payload: input.payload,
          clientTimestamp,
          lastError: null,
          nextRetryAt: 0,
        };
        return;
      }
    }

    if (input.opType === "CREATE") {
      const unsent = existing.find(
        (item) => item.status === "pending" && item.attempts === 0,
      );
      if (unsent) {
        await db.syncQueue.update(unsent.seq, {
          payload: input.payload,
          clientTimestamp,
          lastError: null,
          nextRetryAt: 0,
        });
        result = { ...unsent, payload: input.payload, clientTimestamp };
        return;
      }
    }

    result = await addItem(input, clientTimestamp);
  });

  return result;
}

async function addItem(input: EnqueueInput, clientTimestamp: string): Promise<SyncQueueItem> {
  const item: Omit<SyncQueueItem, "seq"> = {
    operationId: uuid(),
    entity: input.entity,
    opType: input.opType,
    entityId: input.entityId,
    payload: input.payload,
    baseVersion: input.baseVersion,
    clientTimestamp,
    status: "pending",
    attempts: 0,
    nextRetryAt: 0,
    lastError: null,
    createdAt: nowISO(),
  };
  const seq = await db.syncQueue.add(item as SyncQueueItem);
  return { ...item, seq };
}

export async function dueOperations(options: {
  manual?: boolean;
  limit?: number;
  exclude?: Set<string>;
} = {}): Promise<SyncQueueItem[]> {
  const { manual = false, limit = 25, exclude } = options;
  const now = Date.now();
  const candidates = await db.syncQueue
    .where("status")
    .anyOf(manual ? ["pending", "failed"] : ["pending"])
    .toArray();

  return candidates
    .filter((item) => !exclude?.has(item.operationId))
    .filter((item) => manual || item.nextRetryAt <= now)
    .sort((a, b) => a.seq - b.seq)
    .slice(0, limit);
}

export async function markInFlight(items: SyncQueueItem[]): Promise<void> {
  await db.transaction("rw", db.syncQueue, async () => {
    await Promise.all(
      items.map((item) => db.syncQueue.update(item.seq, { status: "in_flight" })),
    );
  });
}

export async function removeOperation(seq: number): Promise<void> {
  await db.syncQueue.delete(seq);
}

export async function rescheduleOperation(
  item: SyncQueueItem,
  error: string,
): Promise<void> {
  const attempts = item.attempts + 1;
  const backoff = Math.min(2_000 * 2 ** (attempts - 1), 5 * 60_000);
  await db.syncQueue.update(item.seq, {
    status: "pending",
    attempts,
    nextRetryAt: Date.now() + backoff,
    lastError: error,
  });
}

export async function failOperation(item: SyncQueueItem, error: string): Promise<void> {
  await db.syncQueue.update(item.seq, {
    status: "failed",
    attempts: Math.min(item.attempts + 1, MAX_ATTEMPTS),
    lastError: error,
    nextRetryAt: 0,
  });
}

export async function pendingOperationsFor(entityId: string): Promise<SyncQueueItem[]> {
  return db.syncQueue.where("entityId").equals(entityId).toArray();
}

export async function pendingOperationCount(): Promise<number> {
  return db.syncQueue.count();
}

export async function failedOperationCount(): Promise<number> {
  return db.syncQueue.where("status").equals("failed").count();
}

export async function retryFailedOperations(): Promise<void> {
  const failed = await db.syncQueue.where("status").equals("failed").toArray();
  await db.transaction("rw", db.syncQueue, async () => {
    await Promise.all(
      failed.map((item) =>
        db.syncQueue.update(item.seq, {
          status: "pending",
          attempts: 0,
          nextRetryAt: 0,
          lastError: null,
        }),
      ),
    );
  });
}
