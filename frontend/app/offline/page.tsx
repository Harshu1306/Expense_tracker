import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeftRight,
  CloudOff,
  LayoutDashboard,
  Plus,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Offline",
};

export default function OfflinePage() {
  return (
    <div className="mx-auto max-w-2xl py-6 sm:py-10">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 px-6 py-8 text-white sm:px-8">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-blue-200">
            <CloudOff className="h-6 w-6" />
          </span>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">
            You&apos;re offline — SpendWise still works
          </h1>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-slate-300">
            This page is cached by the service worker. Your transactions and budgets live in
            IndexedDB on this device, so you can keep viewing, adding and editing without a
            connection.
          </p>
        </div>

        <div className="space-y-4 p-6 sm:p-8">
          <div className="grid gap-3 sm:grid-cols-3">
            <Feature
              icon={ArrowLeftRight}
              title="Keep recording"
              text="Add expenses and income as usual."
            />
            <Feature
              icon={ShieldCheck}
              title="Nothing lost"
              text="Changes queue persistently on this device."
            />
            <Feature
              icon={RefreshCw}
              title="Auto-retry"
              text="Reconnect and the queue drains itself."
            />
          </div>

          <div className="flex flex-col gap-2 border-t border-slate-100 pt-5 sm:flex-row">
            <Link
              href="/"
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              <LayoutDashboard className="h-4 w-4" />
              Go to dashboard
            </Link>
            <Link
              href="/transactions/new"
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              <Plus className="h-4 w-4" />
              Add transaction
            </Link>
          </div>

          <p className="text-[11px] leading-relaxed text-slate-400">
            Offline caching is enabled in production builds (
            <code className="font-mono">npm run build &amp;&amp; npm start</code>). If you opened
            this page by mistake, reconnect and try again — the sync indicator in the header will
            show <strong className="font-semibold text-slate-500">Online</strong>.
          </p>
        </div>
      </div>
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  text,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
      <Icon className="h-4 w-4 text-blue-600" />
      <p className="mt-2 text-xs font-semibold text-slate-900">{title}</p>
      <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{text}</p>
    </div>
  );
}
