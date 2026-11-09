"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  CloudUpload,
  RefreshCw,
  Settings,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useSyncActions, useSyncStatus } from "@/hooks/useSync";
import { formatRelativeTime } from "@/lib/dates";
import { cn } from "@/lib/utils";

const CONFIG = {
  online: {
    label: "Online",
    icon: Wifi,
    pill: "border-blue-200 bg-blue-50 text-blue-700",
    dot: "bg-blue-500",
  },
  offline: {
    label: "Offline",
    icon: WifiOff,
    pill: "border-slate-200 bg-slate-100 text-slate-600",
    dot: "bg-slate-400",
  },
  syncing: {
    label: "Syncing",
    icon: RefreshCw,
    pill: "border-blue-200 bg-blue-50 text-blue-700",
    dot: "bg-blue-500",
  },
  synced: {
    label: "Synced",
    icon: CheckCircle2,
    pill: "border-emerald-200 bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-500",
  },
  failed: {
    label: "Sync failed",
    icon: AlertTriangle,
    pill: "border-red-200 bg-red-50 text-red-700",
    dot: "bg-red-500",
  },
} as const;

export function SyncIndicator() {
  const sync = useSyncStatus();
  const { syncNow, syncing } = useSyncActions();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const config = CONFIG[sync.state];
  const Icon = config.icon;
  const busy = syncing || sync.state === "syncing";

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition hover:brightness-[0.98]",
          config.pill,
        )}
        title={`${config.label}${sync.pendingCount ? ` · ${sync.pendingCount} pending` : ""}`}
      >
        <span className="relative flex h-2 w-2">
          <span className={cn("absolute inline-flex h-full w-full rounded-full opacity-40", config.dot, busy && "animate-ping")} />
          <span className={cn("relative inline-flex h-2 w-2 rounded-full", config.dot)} />
        </span>
        <Icon className={cn("h-3.5 w-3.5", busy && "animate-spin")} />
        <span className="hidden sm:inline">{config.label}</span>
        {sync.pendingCount > 0 ? (
          <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-bold tabular-nums">
            {sync.pendingCount}
          </span>
        ) : null}
        {sync.conflictCount > 0 ? (
          <span
            className="h-1.5 w-1.5 rounded-full bg-orange-500"
            title={`${sync.conflictCount} conflicts`}
          />
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Synchronisation status"
          className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl animate-fade-in"
        >
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Synchronisation
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span className={cn("h-2 w-2 rounded-full", config.dot)} />
              <p className="text-sm font-semibold text-slate-900">{config.label}</p>
              {sync.lastSyncedAt ? (
                <span className="ml-auto text-[11px] text-slate-400">
                  {formatRelativeTime(sync.lastSyncedAt)}
                </span>
              ) : null}
            </div>
            {sync.lastError ? (
              <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-2 text-[11px] leading-relaxed text-red-700">
                {sync.lastError}
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
            <Stat label="Pending" value={sync.pendingCount} />
            <Stat label="Failed" value={sync.failedCount} danger={sync.failedCount > 0} />
            <Stat label="Conflicts" value={sync.conflictCount} warning={sync.conflictCount > 0} />
          </div>

          <div className="space-y-2 p-3">
            <button
              type="button"
              onClick={() => {
                void syncNow();
              }}
              disabled={!sync.online || busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} />
              {busy ? "Syncing…" : sync.online ? "Sync now" : "Offline — will retry"}
            </button>
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              <Settings className="h-3.5 w-3.5" />
              Sync settings
            </Link>
            <p className="flex items-start gap-1.5 px-1 pt-1 text-[10px] leading-relaxed text-slate-400">
              <CloudUpload className="mt-0.5 h-3 w-3 shrink-0" />
              Changes are stored locally first, then uploaded with idempotent operation IDs.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  danger,
  warning,
}: {
  label: string;
  value: number;
  danger?: boolean;
  warning?: boolean;
}) {
  return (
    <div className="px-3 py-2.5 text-center">
      <p
        className={cn(
          "text-base font-semibold tabular-nums",
          danger ? "text-red-600" : warning ? "text-orange-600" : "text-slate-900",
        )}
      >
        {value}
      </p>
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}
