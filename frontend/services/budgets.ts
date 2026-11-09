"use client";

import { db } from "@/services/db";
import { enqueueOperation } from "@/services/queue";
import { notifyLocalMutation } from "@/services/sync";
import { toApiBudget } from "@/services/api";
import type { Category, LocalBudget } from "@/types";
import { nowISO } from "@/lib/dates";
import { uuid } from "@/lib/utils";

export interface SetBudgetInput {
  category: "All" | Category;
  monthlyLimitPaise: number;
  month: number;
  year: number;
}

export async function setBudget(input: SetBudgetInput): Promise<LocalBudget> {
  const timestamp = nowISO();
  let saved!: LocalBudget;

  await db.transaction("rw", db.budgets, db.syncQueue, async () => {
    const existing = await db.budgets
      .filter(
        (budget) =>
          budget.deletedAt === null &&
          budget.category === input.category &&
          budget.month === input.month &&
          budget.year === input.year,
      )
      .first();

    if (existing) {
      saved = {
        ...existing,
        monthlyLimitPaise: input.monthlyLimitPaise,
        updatedAt: timestamp,
        syncState: "pending",
      };
      await db.budgets.put(saved);
      await enqueueOperation({
        entity: "budget",
        opType: "UPDATE",
        entityId: existing.id,
        payload: toApiBudget(saved) as unknown as Record<string, unknown>,
        baseVersion: existing.version,
        clientTimestamp: timestamp,
      });
    } else {
      saved = {
        id: uuid(),
        category: input.category,
        monthlyLimitPaise: input.monthlyLimitPaise,
        month: input.month,
        year: input.year,
        createdAt: timestamp,
        updatedAt: timestamp,
        version: 0,
        deletedAt: null,
        syncState: "pending",
      };
      await db.budgets.add(saved);
      await enqueueOperation({
        entity: "budget",
        opType: "CREATE",
        entityId: saved.id,
        payload: toApiBudget(saved) as unknown as Record<string, unknown>,
        baseVersion: 0,
        clientTimestamp: timestamp,
      });
    }
  });

  notifyLocalMutation();
  return saved;
}

export async function updateBudgetLimit(
  id: string,
  monthlyLimitPaise: number,
): Promise<LocalBudget> {
  const timestamp = nowISO();
  let saved!: LocalBudget;

  await db.transaction("rw", db.budgets, db.syncQueue, async () => {
    const existing = await db.budgets.get(id);
    if (!existing || existing.deletedAt !== null) throw new Error("Budget not found");
    saved = {
      ...existing,
      monthlyLimitPaise,
      updatedAt: timestamp,
      syncState: "pending",
    };
    await db.budgets.put(saved);
    await enqueueOperation({
      entity: "budget",
      opType: "UPDATE",
      entityId: existing.id,
      payload: toApiBudget(saved) as unknown as Record<string, unknown>,
      baseVersion: existing.version,
      clientTimestamp: timestamp,
    });
  });

  notifyLocalMutation();
  return saved;
}

export async function deleteBudget(id: string): Promise<void> {
  const timestamp = nowISO();
  await db.transaction("rw", db.budgets, db.syncQueue, async () => {
    const existing = await db.budgets.get(id);
    if (!existing) return;
    const tombstone: LocalBudget = {
      ...existing,
      deletedAt: timestamp,
      updatedAt: timestamp,
      syncState: "pending",
    };
    await db.budgets.put(tombstone);
    await enqueueOperation({
      entity: "budget",
      opType: "DELETE",
      entityId: existing.id,
      payload: toApiBudget(tombstone) as unknown as Record<string, unknown>,
      baseVersion: existing.version,
      clientTimestamp: timestamp,
    });
  });
  notifyLocalMutation();
}
