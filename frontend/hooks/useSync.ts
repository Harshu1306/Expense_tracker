"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  getServerSyncSnapshot,
  getSyncSnapshot,
  retryAndSync,
  startSyncEngine,
  subscribeSync,
  syncNow as runSyncNow,
} from "@/services/sync";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/services/db";
import { computeDashboard } from "@/services/analytics";
import { useBudgets } from "@/hooks/useTransactions";

export function useSyncStatus() {
  return useSyncExternalStore(
    subscribeSync,
    getSyncSnapshot,
    getServerSyncSnapshot,
  );
}

/** Mount once in the app shell. */
export function useSyncEngine() {
  useEffect(() => startSyncEngine(), []);
}

export function useSyncActions() {
  const [syncing, setSyncing] = useState(false);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    try {
      await runSyncNow();
    } finally {
      setSyncing(false);
    }
  }, []);

  const retry = useCallback(async () => {
    setSyncing(true);
    try {
      await retryAndSync();
    } finally {
      setSyncing(false);
    }
  }, []);

  return { syncNow, retry, syncing };
}

export function useDashboardData() {
  return useLiveQuery(async () => {
    const [transactions, budgets] = await Promise.all([
      db.transactions.toArray(),
      db.budgets.toArray(),
    ]);
    return computeDashboard(transactions, budgets);
  }, []);
}

export function useBudgetData(month: number, year: number) {
  const transactions = useLiveQuery(() => db.transactions.toArray(), []);
  const budgets = useBudgets(month, year);
  if (!transactions || !budgets) return undefined;
  return { transactions, budgets };
}
