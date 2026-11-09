"use client";

import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import type { LocalTransaction } from "@/types";
import { CategoryIcon } from "@/components/CategoryIcon";
import { StatusBadge } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { cn } from "@/lib/utils";

export function TransactionItem({
  transaction,
  onDelete,
  compact = false,
}: {
  transaction: LocalTransaction;
  onDelete?: (transaction: LocalTransaction) => void;
  compact?: boolean;
}) {
  const income = transaction.type === "income";

  return (
    <li className="group flex items-center gap-3 px-4 py-3 transition hover:bg-slate-50/80 sm:px-5">
      <CategoryIcon category={transaction.category} size={compact ? "md" : "md"} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-slate-900">{transaction.title}</p>
          <StatusBadge state={transaction.syncState} />
        </div>
        <p className="mt-0.5 truncate text-[11px] text-slate-400">
          {transaction.category}
          <span className="mx-1.5 text-slate-300">·</span>
          {transaction.paymentMethod}
          <span className="mx-1.5 text-slate-300">·</span>
          {formatDate(transaction.date)}
          {transaction.notes ? (
            <>
              <span className="mx-1.5 text-slate-300">·</span>
              <span className="text-slate-400">{transaction.notes}</span>
            </>
          ) : null}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <p
          className={cn(
            "text-sm font-semibold tabular-nums",
            income ? "text-emerald-600" : "text-rose-600",
          )}
        >
          {income ? "+" : "−"}
          {formatINR(transaction.amountPaise)}
        </p>

        <div className="ml-1 flex items-center gap-0.5 sm:opacity-0 sm:transition sm:group-hover:opacity-100 sm:focus-within:opacity-100">
          <Link
            href={`/transactions/edit?id=${transaction.id}`}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-blue-50 hover:text-blue-600"
            aria-label={`Edit ${transaction.title}`}
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Link>
          {onDelete ? (
            <button
              type="button"
              onClick={() => onDelete(transaction)}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
              aria-label={`Delete ${transaction.title}`}
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );
}
