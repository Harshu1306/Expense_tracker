import Link from "next/link";
import { Compass, LayoutDashboard, Plus } from "lucide-react";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
        <Compass className="h-6 w-6" />
      </span>
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-600">
        404
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
        This page went missing
      </h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
        The page you were looking for doesn&apos;t exist. Your transactions and budgets are safe
        on this device.
      </p>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <Link
          href="/"
          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          <LayoutDashboard className="h-4 w-4" />
          Back to dashboard
        </Link>
        <Link
          href="/transactions/new"
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          <Plus className="h-4 w-4" />
          Add transaction
        </Link>
      </div>
    </div>
  );
}
