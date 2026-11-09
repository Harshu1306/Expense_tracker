import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CloudOff, IndianRupee, ShieldCheck, Zap } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { TransactionForm } from "@/components/TransactionForm";

export const metadata: Metadata = {
  title: "Add transaction",
};

export default function NewTransactionPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="New entry"
        title="Add transaction"
        description="Record an expense or income in rupees. It is saved on this device before anything else happens."
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
          <TransactionForm />
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-violet-50 p-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm">
              <Zap className="h-4 w-4" />
            </span>
            <h2 className="mt-3 text-sm font-semibold text-slate-900">
              Saved locally, synced later
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
              Saving writes to IndexedDB and a persistent outbox in one step. The network is
              never on the critical path, so a slow server can&apos;t block your entry.
            </p>
          </div>

          <div className="card p-5">
            <h2 className="text-sm font-semibold text-slate-900">Good to know</h2>
            <ul className="mt-3 space-y-3 text-xs leading-relaxed text-slate-500">
              <li className="flex gap-2.5">
                <IndianRupee className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                <span>
                  Amounts are stored as <strong className="font-semibold text-slate-700">integer paise</strong>{" "}
                  — no floating point rounding.
                </span>
              </li>
              <li className="flex gap-2.5">
                <CloudOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
                <span>
                  Offline? The entry is queued and uploaded automatically when you reconnect.
                </span>
              </li>
              <li className="flex gap-2.5">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-600" />
                <span>
                  Every sync operation has a unique ID, so retries never create duplicates.
                </span>
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
