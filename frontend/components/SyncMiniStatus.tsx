"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, RefreshCw, WifiOff } from "lucide-react";
import { useSyncStatus } from "@/hooks/useSync";
import { formatRelativeTime } from "@/lib/dates";
import { cn } from "@/lib/utils";

export function SyncMiniStatus() {
  const sync = useSyncStatus();
  const Icon =
    sync.state === "offline"
      ? WifiOff
      : sync.state === "failed"
        ? AlertTriangle
        : sync.state === "syncing"
          ? RefreshCw
          : CheckCircle2;

  return (
    <Link
      href="/settings"
      className="block rounded-xl border border-slate-200 bg-slate-50/80 p-3 transition hover:border-slate-300 hover:bg-slate-50"
    >
      <div className="flex items-center gap-2">
        <Icon
          className={cn(
            "h-3.5 w-3.5",
            sync.state === "offline" && "text-slate-400",
            sync.state === "failed" && "text-red-500",
            sync.state === "syncing" && "animate-spin text-blue-500",
            sync.state === "synced" && "text-emerald-500",
            sync.state === "online" && "text-blue-500",
          )}
        />
        <p className="text-[11px] font-semibold text-slate-700">
          {sync.online ? "Local-first sync" : "Working offline"}
        </p>
        <span
          className={cn(
            "ml-auto h-1.5 w-1.5 rounded-full",
            sync.online ? "bg-emerald-500" : "bg-slate-400",
          )}
        />
      </div>
      <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
        {sync.pendingCount > 0
          ? `${sync.pendingCount} pending · ${formatRelativeTime(sync.lastSyncedAt)}`
          : `All changes saved · ${formatRelativeTime(sync.lastSyncedAt)}`}
      </p>
    </Link>
  );
}
