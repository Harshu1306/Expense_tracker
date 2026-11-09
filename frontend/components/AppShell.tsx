"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  BarChart3,
  LayoutDashboard,
  Menu,
  Plus,
  Settings,
  Target,
  Wallet,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SyncIndicator } from "@/components/SyncIndicator";
import { SyncMiniStatus } from "@/components/SyncMiniStatus";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { ToastProvider } from "@/components/ToastProvider";
import { useSyncEngine, useSyncStatus } from "@/hooks/useSync";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/budgets", label: "Budgets", icon: Target },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-sm shadow-blue-200">
          <Wallet className="h-5 w-5" />
        </span>
        <div>
          <p className="text-base font-semibold tracking-tight text-slate-900">SpendWise</p>
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
            Daily expense tracker
          </p>
        </div>
      </div>

      <div className="px-4 pb-2">
        <Link
          href="/transactions/new"
          onClick={onNavigate}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-200 transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          <Plus className="h-4 w-4" />
          Add transaction
        </Link>
      </div>

      <nav className="mt-3 flex-1 space-y-1 px-3" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                active
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              )}
            >
              <Icon
                className={cn(
                  "h-4.5 w-4.5",
                  active ? "text-blue-600" : "text-slate-400 group-hover:text-slate-600",
                )}
              />
              {item.label}
              {active ? (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-600" aria-hidden />
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="p-3">
        <SyncMiniStatus />
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  useSyncEngine();
  const [mobileOpen, setMobileOpen] = useState(false);
  const sync = useSyncStatus();

  useEffect(() => {
    setMobileOpen(false);
    // Signals to end-to-end tests (and anything else that cares) that React has
    // hydrated. Without this, a click on a server-rendered form can fall through
    // to a native form submission before the submit handler is attached.
    document.documentElement.dataset.hydrated = "true";
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

  return (
    <ToastProvider>
      <ServiceWorkerRegister />
      <div className="min-h-screen bg-slate-50">
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-slate-200 bg-white lg:block">
          <SidebarContent />
        </aside>

        {mobileOpen ? (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              aria-label="Close menu"
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="relative z-10 h-full w-72 max-w-[85%] border-r border-slate-200 bg-white shadow-2xl animate-fade-in">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="absolute right-3 top-4 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close navigation"
              >
                <X className="h-4 w-4" />
              </button>
              <SidebarContent onNavigate={() => setMobileOpen(false)} />
            </aside>
          </div>
        ) : null}

        <div className="lg:pl-64">
          <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur-md">
            <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 lg:hidden"
                aria-label="Open navigation"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-2 lg:hidden">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-violet-600 text-white">
                  <Wallet className="h-4 w-4" />
                </span>
                <span className="text-sm font-semibold text-slate-900">SpendWise</span>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <SyncIndicator />
                <Link
                  href="/transactions/new"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 sm:hidden"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </Link>
              </div>
            </div>
          </header>

          {!sync.online ? (
            <div className="border-b border-amber-200 bg-amber-50">
              <div className="mx-auto max-w-7xl px-4 py-2 text-xs font-medium text-amber-800 sm:px-6 lg:px-8">
                You&apos;re offline. Everything still works — changes are saved on this device
                {sync.pendingCount > 0 ? ` (${sync.pendingCount} waiting to sync)` : ""} and will
                sync automatically when you reconnect.
              </div>
            </div>
          ) : null}

          {sync.conflictCount > 0 ? (
            <div className="border-b border-orange-200 bg-orange-50">
              <div className="mx-auto max-w-7xl px-4 py-2 text-xs font-medium text-orange-800 sm:px-6 lg:px-8">
                {sync.conflictCount} sync{" "}
                {sync.conflictCount === 1 ? "conflict needs" : "conflicts need"} review.{" "}
                <Link href="/settings#conflicts" className="underline underline-offset-2">
                  Review in Settings
                </Link>
              </div>
            </div>
          ) : null}

          <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {children}
          </main>
          <footer className="mx-auto max-w-7xl px-4 pb-8 text-center text-[11px] text-slate-400 sm:px-6 lg:px-8">
            SpendWise · Offline-first · Amounts stored as integer paise · INR
          </footer>
        </div>
      </div>
    </ToastProvider>
  );
}
