"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeftRight,
  Plus,
  ReceiptText,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import type { LocalTransaction, TransactionFilters } from "@/types";
import { EMPTY_FILTERS } from "@/types";
import { useTransactions } from "@/hooks/useTransactions";
import { FiltersBar } from "@/components/FiltersBar";
import { TransactionItem } from "@/components/TransactionItem";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/ToastProvider";
import {
  EmptyState,
  ListSkeleton,
  PageHeader,
  SectionCard,
  StatCard,
  StatCardsSkeleton,
} from "@/components/ui";
import { deleteTransaction } from "@/services/transactions";
import { formatINR, sumPaise } from "@/lib/money";
import { formatDate, todayISO } from "@/lib/dates";

function isToday(date: string): boolean {
  return date === todayISO();
}

function isYesterday(date: string): boolean {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const value = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
  return date === value;
}

function dayHeading(date: string): string {
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return formatDate(date);
}

export default function TransactionsPage() {
  const { toast } = useToast();
  const [filters, setFilters] = useState<TransactionFilters>(EMPTY_FILTERS);
  const [toDelete, setToDelete] = useState<LocalTransaction | null>(null);
  const [deleting, setDeleting] = useState(false);

  const transactions = useTransactions(filters);

  const stats = useMemo(() => {
    if (!transactions) return null;
    const incomePaise = sumPaise(
      transactions
        .filter((transaction) => transaction.type === "income")
        .map((transaction) => transaction.amountPaise),
    );
    const expensePaise = sumPaise(
      transactions
        .filter((transaction) => transaction.type === "expense")
        .map((transaction) => transaction.amountPaise),
    );
    return {
      count: transactions.length,
      incomePaise,
      expensePaise,
      netPaise: incomePaise - expensePaise,
    };
  }, [transactions]);

  const groups = useMemo(() => {
    if (!transactions) return [];
    const map = new Map<string, LocalTransaction[]>();
    for (const transaction of transactions) {
      const bucket = map.get(transaction.date);
      if (bucket) bucket.push(transaction);
      else map.set(transaction.date, [transaction]);
    }
    return [...map.entries()];
  }, [transactions]);

  const filtersDirty =
    filters.q !== "" ||
    filters.type !== "all" ||
    filters.category !== "all" ||
    filters.startDate !== "" ||
    filters.endDate !== "";

  const groupedByDate = filters.sort === "date_desc" || filters.sort === "date_asc";

  async function handleDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deleteTransaction(toDelete.id);
      toast(
        "Transaction deleted",
        "success",
        "Removed from this device and queued for deletion on the server.",
      );
      setToDelete(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not delete transaction.";
      toast("Could not delete transaction", "error", message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="All activity"
        title="Transactions"
        description="Search, filter and edit every income and expense. Changes save locally first and sync in the background."
        actions={
          <Link
            href="/transactions/new"
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2.5 text-xs font-semibold text-white shadow-sm shadow-blue-200 transition hover:bg-blue-700"
          >
            <Plus className="h-3.5 w-3.5" />
            Add transaction
          </Link>
        }
      />

      {stats ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Transactions"
            value={String(stats.count)}
            hint={filtersDirty ? "Matching your filters" : "Saved on this device"}
            icon={ReceiptText}
            tone="blue"
          />
          <StatCard
            label="Income"
            value={formatINR(stats.incomePaise)}
            hint="Filtered income total"
            icon={TrendingUp}
            tone="emerald"
          />
          <StatCard
            label="Expenses"
            value={formatINR(stats.expensePaise)}
            hint="Filtered expense total"
            icon={TrendingDown}
            tone="violet"
          />
          <StatCard
            label="Net"
            value={formatINR(stats.netPaise)}
            hint="Income minus expenses"
            icon={Wallet}
            tone={stats.netPaise >= 0 ? "emerald" : "rose"}
          />
        </div>
      ) : (
        <StatCardsSkeleton />
      )}

      <FiltersBar
        filters={filters}
        onChange={setFilters}
        resultCount={transactions?.length}
      />

      {!transactions ? (
        <ListSkeleton rows={6} />
      ) : (
        <SectionCard
          title={filtersDirty ? "Filtered activity" : "All activity"}
          description={
            transactions.length > 0
              ? `${transactions.length} ${transactions.length === 1 ? "transaction" : "transactions"} · newest changes first`
              : "Nothing here yet"
          }
        >
          {transactions.length === 0 ? (
            filtersDirty ? (
              <EmptyState
                icon={ArrowLeftRight}
                title="No transactions match these filters"
                description="Try a different search, category or date range."
                action={
                  <button
                    type="button"
                    onClick={() => setFilters(EMPTY_FILTERS)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    Clear filters
                  </button>
                }
              />
            ) : (
              <EmptyState
                icon={ReceiptText}
                title="No transactions yet"
                description="Add your first expense or income — it works instantly, even offline."
                action={
                  <Link
                    href="/transactions/new"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-700"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add transaction
                  </Link>
                }
              />
            )
          ) : groupedByDate ? (
            <div>
              {groups.map(([date, items]) => {
                const expense = sumPaise(
                  items
                    .filter((item) => item.type === "expense")
                    .map((item) => item.amountPaise),
                );
                const income = sumPaise(
                  items
                    .filter((item) => item.type === "income")
                    .map((item) => item.amountPaise),
                );
                return (
                  <div key={date}>
                    <div className="flex items-center justify-between gap-2 border-y border-slate-100 bg-slate-50/70 px-4 py-2 first:border-t-0 sm:px-5">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        {dayHeading(date)}
                      </p>
                      <p className="text-[11px] tabular-nums text-slate-400">
                        {income > 0 ? (
                          <span className="mr-2 text-emerald-600">+{formatINR(income)}</span>
                        ) : null}
                        {expense > 0 ? (
                          <span className="text-rose-600">−{formatINR(expense)}</span>
                        ) : null}
                      </p>
                    </div>
                    <ul className="divide-y divide-slate-100">
                      {items.map((transaction) => (
                        <TransactionItem
                          key={transaction.id}
                          transaction={transaction}
                          onDelete={setToDelete}
                        />
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {transactions.map((transaction) => (
                <TransactionItem
                  key={transaction.id}
                  transaction={transaction}
                  onDelete={setToDelete}
                />
              ))}
            </ul>
          )}
        </SectionCard>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title="Delete this transaction?"
        description={
          toDelete
            ? `“${toDelete.title}” (${formatINR(toDelete.amountPaise)}) will be removed from this device immediately. The deletion is queued and synced to the server when you're online.`
            : undefined
        }
        confirmLabel="Delete transaction"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => !deleting && setToDelete(null)}
      />
    </div>
  );
}
