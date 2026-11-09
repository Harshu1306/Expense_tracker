"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, FileQuestion } from "lucide-react";
import { PageHeader, EmptyState, Skeleton } from "@/components/ui";
import { TransactionForm } from "@/components/TransactionForm";
import { useTransaction } from "@/hooks/useTransactions";

function EditTransactionContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const transaction = useTransaction(id);

  if (transaction === undefined) {
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="Edit entry" title="Edit transaction" />
        <div className="card p-5 sm:p-6">
          <Skeleton className="h-11 w-full rounded-2xl" />
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <Skeleton className="h-10 sm:col-span-2" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-24 sm:col-span-2" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        </div>
      </div>
    );
  }

  if (transaction === null) {
    return (
      <div className="space-y-5">
        <PageHeader
          eyebrow="Edit entry"
          title="Transaction not found"
          description="It may have been deleted on this device or never existed."
          actions={
            <Link
              href="/transactions"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to transactions
            </Link>
          }
        />
        <div className="card">
          <EmptyState
            icon={FileQuestion}
            title="Nothing to edit here"
            description="Open the transactions list and choose an entry, or add a new one."
            action={
              <Link
                href="/transactions/new"
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-700"
              >
                Add transaction
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Edit entry"
        title="Edit transaction"
        description="Update the details below. The change saves locally first, then syncs with a fresh timestamp."
        actions={
          <Link
            href="/transactions"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to transactions
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="card p-5 sm:p-6 lg:col-span-2">
          <TransactionForm mode="edit" initial={transaction} />
        </div>
        <aside className="card h-fit p-5">
          <h2 className="text-sm font-semibold text-slate-900">Editing safely</h2>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
            This entry keeps its original ID. The update is queued with the last server version
            this device has seen, so the server can detect a simultaneous edit.
          </p>
          <dl className="mt-4 space-y-2.5 border-t border-slate-100 pt-4 text-[11px]">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-400">Created</dt>
              <dd className="font-medium text-slate-600">
                {new Date(transaction.createdAt).toLocaleString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-400">Server version</dt>
              <dd className="font-medium text-slate-600">v{transaction.version}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-400">Sync state</dt>
              <dd className="font-medium capitalize text-slate-600">{transaction.syncState}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  );
}

export default function EditTransactionPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-5">
          <PageHeader eyebrow="Edit entry" title="Edit transaction" />
          <div className="card p-5 sm:p-6">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="mt-4 h-10 w-full" />
            <Skeleton className="mt-4 h-24 w-full" />
          </div>
        </div>
      }
    >
      <EditTransactionContent />
    </Suspense>
  );
}
