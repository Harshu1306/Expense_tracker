"use client";

import { db } from "@/services/db";
import { enqueueOperation } from "@/services/queue";
import { notifyLocalMutation } from "@/services/sync";
import { toApiTransaction } from "@/services/api";
import type { LocalTransaction, TransactionInput } from "@/types";
import { nowISO } from "@/lib/dates";
import { uuid } from "@/lib/utils";

/**
 * Local-first transaction repository.
 *
 * Every mutation writes IndexedDB *and* the persistent sync queue before the
 * promise resolves.  No network call is made here, so adding an expense works
 * with the server down, offline, or on a plane.
 */
export async function createTransaction(input: TransactionInput): Promise<LocalTransaction> {
  const timestamp = nowISO();
  const transaction: LocalTransaction = {
    id: uuid(),
    title: input.title.trim(),
    amountPaise: input.amountPaise,
    type: input.type,
    category: input.category,
    date: input.date,
    paymentMethod: input.paymentMethod,
    notes: input.notes.trim(),
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 0,
    deletedAt: null,
    syncState: "pending",
  };

  await db.transaction("rw", db.transactions, db.syncQueue, async () => {
    await db.transactions.add(transaction);
    await enqueueOperation({
      entity: "transaction",
      opType: "CREATE",
      entityId: transaction.id,
      payload: toApiTransaction(transaction) as unknown as Record<string, unknown>,
      baseVersion: 0,
      clientTimestamp: timestamp,
    });
  });

  notifyLocalMutation();
  return transaction;
}

export async function updateTransaction(
  id: string,
  input: TransactionInput,
): Promise<LocalTransaction> {
  const timestamp = nowISO();
  let updated!: LocalTransaction;

  await db.transaction("rw", db.transactions, db.syncQueue, async () => {
    const existing = await db.transactions.get(id);
    if (!existing || existing.deletedAt !== null) {
      throw new Error("Transaction not found");
    }
    updated = {
      ...existing,
      title: input.title.trim(),
      amountPaise: input.amountPaise,
      type: input.type,
      category: input.category,
      date: input.date,
      paymentMethod: input.paymentMethod,
      notes: input.notes.trim(),
      updatedAt: timestamp,
      syncState: "pending",
    };
    await db.transactions.put(updated);
    await enqueueOperation({
      entity: "transaction",
      opType: "UPDATE",
      entityId: updated.id,
      payload: toApiTransaction(updated) as unknown as Record<string, unknown>,
      baseVersion: existing.version,
      clientTimestamp: timestamp,
    });
  });

  notifyLocalMutation();
  return updated;
}

export async function deleteTransaction(id: string): Promise<LocalTransaction> {
  const timestamp = nowISO();
  let tombstone!: LocalTransaction;

  await db.transaction("rw", db.transactions, db.syncQueue, async () => {
    const existing = await db.transactions.get(id);
    if (!existing) throw new Error("Transaction not found");
    tombstone = {
      ...existing,
      deletedAt: timestamp,
      updatedAt: timestamp,
      syncState: "pending",
    };
    await db.transactions.put(tombstone);
    await enqueueOperation({
      entity: "transaction",
      opType: "DELETE",
      entityId: existing.id,
      payload: toApiTransaction(tombstone) as unknown as Record<string, unknown>,
      baseVersion: existing.version,
      clientTimestamp: timestamp,
    });
  });

  notifyLocalMutation();
  return tombstone;
}

export async function getLocalTransaction(id: string): Promise<LocalTransaction | undefined> {
  return db.transactions.get(id);
}

export async function getAllLocalTransactions(): Promise<LocalTransaction[]> {
  return db.transactions.toArray();
}
