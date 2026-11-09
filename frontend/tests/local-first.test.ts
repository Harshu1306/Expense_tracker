import { describe, expect, it } from "vitest";
import { db } from "@/services/db";
import { pendingOperationsFor } from "@/services/queue";
import {
  createTransaction,
  deleteTransaction,
  getAllLocalTransactions,
  getLocalTransaction,
  updateTransaction,
} from "@/services/transactions";
import { deleteBudget, setBudget, updateBudgetLimit } from "@/services/budgets";
import type { TransactionInput } from "@/types";

const INPUT: TransactionInput = {
  title: "Filter coffee",
  amountPaise: 4500,
  type: "expense",
  category: "Food",
  date: "2026-05-15",
  paymentMethod: "UPI",
  notes: "Morning",
};

describe("local-first transaction repository", () => {
  it("writes the record and a queued CREATE before returning", async () => {
    const transaction = await createTransaction(INPUT);
    const stored = await db.transactions.get(transaction.id);
    expect(stored?.title).toBe("Filter coffee");
    expect(stored?.amountPaise).toBe(4500);
    expect(stored?.syncState).toBe("pending");
    expect(stored?.version).toBe(0);

    const queue = await pendingOperationsFor(transaction.id);
    expect(queue).toHaveLength(1);
    expect(queue[0].opType).toBe("CREATE");
    expect(queue[0].payload.amount_paise).toBe(4500);
    expect(queue[0].operationId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("persists across a database close/reopen (refresh simulation)", async () => {
    const transaction = await createTransaction(INPUT);
    await new Promise((resolve) => setTimeout(resolve, 0));
    db.close();
    await db.open();
    const restored = await getLocalTransaction(transaction.id);
    expect(restored?.title).toBe("Filter coffee");
    expect((await getAllLocalTransactions()).some((item) => item.id === transaction.id)).toBe(
      true,
    );
  });

  it("coalesces unsent edits into a single queued operation", async () => {
    const transaction = await createTransaction(INPUT);
    const original = (await pendingOperationsFor(transaction.id))[0];

    const latest = await updateTransaction(transaction.id, {
      ...INPUT,
      title: "Filter coffee (large)",
      amountPaise: 6500,
    });

    const queue = await pendingOperationsFor(transaction.id);
    expect(queue).toHaveLength(1);
    expect(queue[0].operationId).toBe(original.operationId);
    expect(queue[0].opType).toBe("CREATE");
    expect(queue[0].payload.title).toBe("Filter coffee (large)");
    expect(queue[0].payload.amount_paise).toBe(6500);

    const stored = await db.transactions.get(transaction.id);
    expect(stored?.amountPaise).toBe(6500);
    expect(stored?.updatedAt).toBe(latest.updatedAt);
    expect(stored?.syncState).toBe("pending");
  });

  it("deletes with a tombstone and replaces pending operations", async () => {
    const transaction = await createTransaction(INPUT);
    await updateTransaction(transaction.id, { ...INPUT, title: "Edited" });

    const tombstone = await deleteTransaction(transaction.id);
    expect(tombstone.deletedAt).not.toBeNull();
    expect(tombstone.updatedAt).toBe(tombstone.deletedAt);

    const stored = await db.transactions.get(transaction.id);
    expect(stored?.deletedAt).not.toBeNull();

    const queue = await pendingOperationsFor(transaction.id);
    expect(queue).toHaveLength(1);
    expect(queue[0].opType).toBe("DELETE");
    expect(queue[0].payload.deleted_at).not.toBeNull();

    const visible = await getAllLocalTransactions();
    expect(visible.filter((item) => item.deletedAt === null)).toHaveLength(0);
  });
});

describe("local-first budget repository", () => {
  it("creates, updates and deletes a budget with a single coalesced op", async () => {
    const created = await setBudget({
      category: "Food",
      monthlyLimitPaise: 500000,
      month: 5,
      year: 2026,
    });
    expect(created.monthlyLimitPaise).toBe(500000);
    expect(created.syncState).toBe("pending");

    const updated = await updateBudgetLimit(created.id, 650000);
    expect(updated.monthlyLimitPaise).toBe(650000);
    expect((await db.budgets.get(created.id))?.monthlyLimitPaise).toBe(650000);

    const queue = await pendingOperationsFor(created.id);
    expect(queue).toHaveLength(1);
    expect(queue[0].opType).toBe("CREATE");
    expect(queue[0].payload.monthly_limit_paise).toBe(650000);

    await deleteBudget(created.id);
    const afterDelete = await pendingOperationsFor(created.id);
    expect(afterDelete).toHaveLength(1);
    expect(afterDelete[0].opType).toBe("DELETE");
    expect((await db.budgets.get(created.id))?.deletedAt).not.toBeNull();
  });
});
