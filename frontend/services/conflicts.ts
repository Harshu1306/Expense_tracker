"use client";

import { db } from "@/services/db";
import { enqueueOperation } from "@/services/queue";
import { notifyLocalMutation } from "@/services/sync";
import {
  fromApiBudget,
  fromApiTransaction,
  toApiBudget,
  toApiTransaction,
} from "@/services/api";
import type { ApiBudget, ApiTransaction } from "@/types/api";
import type { ConflictRecord, LocalBudget, LocalTransaction } from "@/types";
import { nowISO } from "@/lib/dates";

export async function getUnresolvedConflicts(): Promise<ConflictRecord[]> {
  const conflicts = await db.conflicts.where("resolved").equals(0).toArray();
  return conflicts.sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
}

/**
 * Accept the server version (already written to IndexedDB when the conflict
 * arrived) and clear the warning badge.
 */
export async function dismissConflict(conflict: ConflictRecord): Promise<void> {
  if (conflict.id === undefined) return;
  await db.transaction("rw", [db.conflicts, db.transactions, db.budgets], async () => {
    await db.conflicts.update(conflict.id!, {
      resolved: 1,
      resolution: "server-wins",
    });
    if (conflict.entity === "transaction") {
      const local = await db.transactions.get(conflict.entityId);
      if (local?.syncState === "conflict") {
        await db.transactions.update(conflict.entityId, { syncState: "synced" });
      }
    } else {
      const local = await db.budgets.get(conflict.entityId);
      if (local?.syncState === "conflict") {
        await db.budgets.update(conflict.entityId, { syncState: "synced" });
      }
    }
  });
  notifyLocalMutation();
}

/**
 * Re-apply the local change as a *new* operation with a fresh timestamp and
 * the current server version.  This is the explicit escape hatch from the
 * last-write-wins policy.
 */
export async function reapplyConflict(conflict: ConflictRecord): Promise<void> {
  if (conflict.id === undefined) return;
  const timestamp = nowISO();
  const serverVersion = Number(conflict.serverRecord?.version ?? 0);

  if (conflict.opType === "DELETE") {
    await db.transaction("rw", [db.budgets, db.transactions, db.syncQueue, db.conflicts], async () => {
      if (conflict.entity === "transaction") {
        const local = await db.transactions.get(conflict.entityId);
        if (local) {
          const tombstone: LocalTransaction = {
            ...local,
            deletedAt: timestamp,
            updatedAt: timestamp,
            syncState: "pending",
          };
          await db.transactions.put(tombstone);
          await enqueueOperation({
            entity: "transaction",
            opType: "DELETE",
            entityId: tombstone.id,
            payload: toApiTransaction(tombstone) as unknown as Record<string, unknown>,
            baseVersion: serverVersion,
            clientTimestamp: timestamp,
          });
        }
      } else {
        const local = await db.budgets.get(conflict.entityId);
        if (local) {
          const tombstone: LocalBudget = {
            ...local,
            deletedAt: timestamp,
            updatedAt: timestamp,
            syncState: "pending",
          };
          await db.budgets.put(tombstone);
          await enqueueOperation({
            entity: "budget",
            opType: "DELETE",
            entityId: tombstone.id,
            payload: toApiBudget(tombstone) as unknown as Record<string, unknown>,
            baseVersion: serverVersion,
            clientTimestamp: timestamp,
          });
        }
      }
      await db.conflicts.update(conflict.id!, {
        resolved: 1,
        resolution: "local-reapplied",
      });
    });
  } else if (conflict.entity === "transaction") {
    const payload = conflict.localPayload as unknown as ApiTransaction;
    const mapped = fromApiTransaction({
      ...payload,
      id: conflict.entityId,
      updated_at: timestamp,
      deleted_at: null,
    });
    const updated: LocalTransaction = {
      ...mapped,
      updatedAt: timestamp,
      version: serverVersion,
      deletedAt: null,
      syncState: "pending",
    };
    await db.transaction("rw", [db.transactions, db.syncQueue, db.conflicts], async () => {
      await db.transactions.put(updated);
      await enqueueOperation({
        entity: "transaction",
        opType: "UPDATE",
        entityId: updated.id,
        payload: toApiTransaction(updated) as unknown as Record<string, unknown>,
        baseVersion: serverVersion,
        clientTimestamp: timestamp,
      });
      await db.conflicts.update(conflict.id!, {
        resolved: 1,
        resolution: "local-reapplied",
      });
    });
  } else {
    const payload = conflict.localPayload as unknown as ApiBudget;
    const mapped = fromApiBudget({
      ...payload,
      id: conflict.entityId,
      updated_at: timestamp,
      deleted_at: null,
    });
    const updated: LocalBudget = {
      ...mapped,
      updatedAt: timestamp,
      version: serverVersion,
      deletedAt: null,
      syncState: "pending",
    };
    await db.transaction("rw", [db.budgets, db.syncQueue, db.conflicts], async () => {
      await db.budgets.put(updated);
      await enqueueOperation({
        entity: "budget",
        opType: "UPDATE",
        entityId: updated.id,
        payload: toApiBudget(updated) as unknown as Record<string, unknown>,
        baseVersion: serverVersion,
        clientTimestamp: timestamp,
      });
      await db.conflicts.update(conflict.id!, {
        resolved: 1,
        resolution: "local-reapplied",
      });
    });
  }

  notifyLocalMutation();
}

export async function clearResolvedConflicts(): Promise<void> {
  await db.conflicts.where("resolved").equals(1).delete();
}
