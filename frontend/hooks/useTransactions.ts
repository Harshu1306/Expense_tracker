"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/services/db";
import { filterTransactions } from "@/services/analytics";
import type {
  Category,
  LocalBudget,
  LocalTransaction,
  TransactionFilters,
  TransactionType,
} from "@/types";
import { EMPTY_FILTERS } from "@/types";

export function useTransactions(filters: TransactionFilters = EMPTY_FILTERS) {
  return useLiveQuery(
    async () => {
      const all = await db.transactions.toArray();
      return filterTransactions(all, filters);
    },
    [
      filters.q,
      filters.type,
      filters.category,
      filters.startDate,
      filters.endDate,
      filters.sort,
    ],
  );
}

export function useAllTransactions() {
  return useLiveQuery(() => db.transactions.toArray(), []);
}

export function useTransaction(id: string | null) {
  // `undefined` means "still loading"; `null` means "not found".  The edit
  // page needs that distinction to avoid flashing a 404 while Dexie opens.
  return useLiveQuery(async () => {
    if (!id) return null;
    const transaction = await db.transactions.get(id);
    if (!transaction || transaction.deletedAt !== null) return null;
    return transaction;
  }, [id]);
}

export function useBudgets(month: number, year: number) {
  return useLiveQuery(
    () =>
      db.budgets
        .filter(
          (budget) =>
            budget.deletedAt === null && budget.month === month && budget.year === year,
        )
        .toArray(),
    [month, year],
  );
}

export function useAllBudgets() {
  return useLiveQuery(() => db.budgets.toArray(), []);
}

export function useRecentTransactions(limit = 6) {
  return useLiveQuery(async () => {
    const all = await db.transactions.filter((tx) => tx.deletedAt === null).toArray();
    return all
      .sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return a.createdAt < b.createdAt ? 1 : -1;
      })
      .slice(0, limit);
  }, [limit]);
}

export function useTransactionStats(filters: TransactionFilters = EMPTY_FILTERS) {
  const transactions = useTransactions(filters);
  if (!transactions) return undefined;
  const incomePaise = transactions
    .filter((transaction) => transaction.type === "income")
    .reduce((total, transaction) => total + transaction.amountPaise, 0);
  const expensePaise = transactions
    .filter((transaction) => transaction.type === "expense")
    .reduce((total, transaction) => total + transaction.amountPaise, 0);
  return {
    count: transactions.length,
    incomePaise,
    expensePaise,
    netPaise: incomePaise - expensePaise,
  };
}

/** Debounce a value (used by the search box). */
export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export type { Category, LocalBudget, LocalTransaction, TransactionType };
