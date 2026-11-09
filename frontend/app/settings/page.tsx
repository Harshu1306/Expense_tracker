"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  AlertTriangle,
  CheckCircle2,
  CloudUpload,
  Database,
  Download,
  HardDrive,
  Info,
  Loader2,
  RefreshCw,
  RotateCcw,
  Server,
  ShieldCheck,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";
import type { ConflictRecord } from "@/types";
import { useSyncActions, useSyncStatus } from "@/hooks/useSync";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/ToastProvider";
import { PageHeader, SectionCard, Skeleton, StatusBadge } from "@/components/ui";
import { api, toApiBudget, toApiTransaction } from "@/services/api";
import { clearLocalData, db, localCounts } from "@/services/db";
import {
  clearResolvedConflicts,
  dismissConflict,
  getUnresolvedConflicts,
  reapplyConflict,
} from "@/services/conflicts";
import { refreshCounters } from "@/services/sync";
import { formatDateTime, formatRelativeTime, todayISO } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { cn } from "@/lib/utils";

const STATE_STYLES = {
  online: "border-blue-200 bg-blue-50 text-blue-700",
  offline: "border-slate-200 bg-slate-100 text-slate-600",
  syncing: "border-blue-200 bg-blue-50 text-blue-700",
  synced: "border-emerald-200 bg-emerald-50 text-emerald-700",
  failed: "border-red-200 bg-red-50 text-red-700",
} as const;

const STATE_LABELS = {
  online: "Online",
  offline: "Offline",
  syncing: "Syncing",
  synced: "Synced",
  failed: "Sync failed",
} as const;

export default function SettingsPage() {
  const { toast } = useToast();
  const sync = useSyncStatus();
  const { syncNow, retry, syncing } = useSyncActions();
  const counts = useLiveQuery(() => localCounts(), []);
  const conflicts = useLiveQuery(() => getUnresolvedConflicts(), []);

  const [testing, setTesting] = useState(false);
  const [health, setHealth] = useState<{ ok: boolean; message: string } | null>(null);
  const [busyConflict, setBusyConflict] = useState<number | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const busy = syncing || sync.state === "syncing";

  async function testConnection() {
    setTesting(true);
    setHealth(null);
    try {
      const result = await api.health();
      setHealth({
        ok: true,
        message: `Connected · ${result.database} database · ${result.status}`,
      });
      toast("Server reachable", "success", `API responded from ${api.baseUrl}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Cannot reach the server.";
      setHealth({ ok: false, message });
      toast("Server unreachable", "error", message);
    } finally {
      setTesting(false);
    }
  }

  async function exportData() {
    setExporting(true);
    try {
      const [transactions, budgets] = await Promise.all([
        db.transactions.toArray(),
        db.budgets.toArray(),
      ]);
      const payload = {
        app: "SpendWise",
        exportedAt: new Date().toISOString(),
        currency: "INR",
        amountUnit: "paise",
        note: "Includes soft-deleted tombstones (deleted_at is not null) so deletes stay meaningful.",
        transactions: transactions.map(toApiTransaction),
        budgets: budgets.map(toApiBudget),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `spendwise-backup-${todayISO()}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast(
        "Backup downloaded",
        "success",
        `${transactions.length} transactions and ${budgets.length} budgets exported.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Export failed.";
      toast("Could not export data", "error", message);
    } finally {
      setExporting(false);
    }
  }

  async function handleClear() {
    setClearing(true);
    try {
      await clearLocalData();
      await refreshCounters();
      toast(
        "Local data cleared",
        "success",
        "The server was not touched. Sync again to pull server data back down.",
      );
      setConfirmClear(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not clear local data.";
      toast("Could not clear data", "error", message);
    } finally {
      setClearing(false);
    }
  }

  async function resolveConflict(
    conflict: ConflictRecord,
    resolution: "server" | "local",
  ) {
    if (conflict.id === undefined) return;
    setBusyConflict(conflict.id);
    try {
      if (resolution === "server") {
        await dismissConflict(conflict);
        toast("Server version kept", "success", "The local conflict flag was cleared.");
      } else {
        await reapplyConflict(conflict);
        toast(
          "Your change re-queued",
          "success",
          "A new operation with a fresh timestamp will sync shortly.",
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not resolve conflict.";
      toast("Conflict resolution failed", "error", message);
    } finally {
      setBusyConflict(null);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Preferences"
        title="Settings"
        description="Inspect sync health, resolve conflicts, and manage the data stored on this device."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard
          title="Synchronisation"
          description="Local changes upload automatically; server changes download after the queue is empty."
          className="lg:col-span-2"
          action={
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                STATE_STYLES[sync.state],
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  sync.state === "offline"
                    ? "bg-slate-400"
                    : sync.state === "failed"
                      ? "bg-red-500"
                      : sync.state === "synced"
                        ? "bg-emerald-500"
                        : "bg-blue-500",
                )}
              />
              {STATE_LABELS[sync.state]}
            </span>
          }
        >
          <div className="grid grid-cols-2 divide-x divide-slate-100 border-b border-slate-100 sm:grid-cols-4">
            <Metric label="Pending" value={sync.pendingCount} />
            <Metric label="Failed" value={sync.failedCount} danger={sync.failedCount > 0} />
            <Metric
              label="Conflicts"
              value={sync.conflictCount}
              warning={sync.conflictCount > 0}
            />
            <Metric
              label="Last sync"
              value={sync.lastSyncedAt ? formatRelativeTime(sync.lastSyncedAt) : "Never"}
              small
            />
          </div>

          <div className="space-y-3 p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void syncNow()}
                disabled={!sync.online || busy}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                {busy ? "Syncing…" : "Sync now"}
              </button>
              <button
                type="button"
                onClick={() => void retry()}
                disabled={!sync.online || busy || sync.failedCount === 0}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Retry failed
              </button>
              <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400">
                {sync.online ? (
                  <>
                    <Wifi className="h-3.5 w-3.5 text-emerald-500" />
                    Browser reports online
                  </>
                ) : (
                  <>
                    <WifiOff className="h-3.5 w-3.5 text-amber-500" />
                    Offline — changes stay queued
                  </>
                )}
              </span>
            </div>

            {sync.lastError ? (
              <p className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] leading-relaxed text-red-700">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {sync.lastError}
              </p>
            ) : (
              <p className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] leading-relaxed text-emerald-700">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {sync.pendingCount === 0
                  ? "Everything on this device is synced."
                  : `${sync.pendingCount} change${sync.pendingCount === 1 ? "" : "s"} waiting to upload. They will retry automatically.`}
              </p>
            )}

            <dl className="grid gap-2 text-[11px] sm:grid-cols-2">
              <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
                <dt className="text-slate-400">Last successful sync</dt>
                <dd className="text-right font-medium text-slate-600">
                  {formatDateTime(sync.lastSyncedAt)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
                <dt className="text-slate-400">Last server pull</dt>
                <dd className="text-right font-medium text-slate-600">
                  {formatDateTime(sync.lastPulledAt)}
                </dd>
              </div>
            </dl>
          </div>
        </SectionCard>

        <SectionCard title="Server connection" description="The FastAPI sync target">
          <div className="space-y-4 p-4 sm:p-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                API base URL
              </p>
              <p className="mt-1 break-all rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 font-mono text-[11px] text-slate-600">
                {api.baseUrl}
              </p>
              <p className="mt-1.5 text-[10px] leading-relaxed text-slate-400">
                Configure with <code className="font-mono">NEXT_PUBLIC_API_URL</code>. The app
                keeps working when this server is unreachable.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void testConnection()}
              disabled={testing}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
            >
              {testing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Server className="h-3.5 w-3.5" />
              )}
              {testing ? "Testing…" : "Test connection"}
            </button>

            {health ? (
              <p
                className={cn(
                  "rounded-xl border px-3 py-2 text-[11px] leading-relaxed",
                  health.ok
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-red-200 bg-red-50 text-red-700",
                )}
              >
                {health.message}
              </p>
            ) : null}

            <div className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[10px] leading-relaxed text-slate-400">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              Connection tests call <code className="font-mono">/api/health</code>. They do not
              upload or download any records.
            </div>
          </div>
        </SectionCard>
      </div>

      <div id="conflicts" className="scroll-mt-24">
        <SectionCard
          title="Sync conflicts"
          description="Last-write-wins by client timestamp. Nothing is silently overwritten while a local edit is pending."
          action={
            conflicts && conflicts.length > 0 ? (
              <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-700">
                {conflicts.length} open
              </span>
            ) : undefined
          }
        >
          {!conflicts ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : conflicts.length === 0 ? (
            <div className="flex items-center gap-3 p-5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900">No conflicts to review</p>
                <p className="text-[11px] text-slate-400">
                  If another device edits the same record first, the conflict will appear here.
                </p>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {conflicts.map((conflict) => (
                <li key={conflict.id ?? conflict.operationId} className="p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold capitalize text-slate-900">
                          {conflict.entity} · {conflict.opType.toLowerCase()}
                        </p>
                        <StatusBadge state="conflict" />
                        <span className="text-[10px] text-slate-400">
                          {formatDateTime(conflict.detectedAt)}
                        </span>
                      </div>
                      <div className="mt-2 grid gap-2 text-[11px] sm:grid-cols-2">
                        <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-2.5 py-2">
                          <p className="font-semibold uppercase tracking-wide text-blue-500">
                            Your change
                          </p>
                          <p className="mt-0.5 text-slate-600">
                            {describeRecord(conflict.localPayload)}
                          </p>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                          <p className="font-semibold uppercase tracking-wide text-slate-400">
                            Server version
                          </p>
                          <p className="mt-0.5 text-slate-600">
                            {describeRecord(conflict.serverRecord)}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void resolveConflict(conflict, "server")}
                        disabled={busyConflict === conflict.id}
                        className="rounded-xl border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                      >
                        Keep server
                      </button>
                      <button
                        type="button"
                        onClick={() => void resolveConflict(conflict, "local")}
                        disabled={busyConflict === conflict.id}
                        className="inline-flex items-center gap-1 rounded-xl bg-orange-600 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-orange-700 disabled:opacity-50"
                      >
                        {busyConflict === conflict.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : null}
                        Reapply mine
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {conflicts && conflicts.length === 0 ? (
            <div className="border-t border-slate-100 px-4 py-2.5">
              <button
                type="button"
                onClick={() => {
                  void clearResolvedConflicts().then(() => {
                    toast("Resolved conflicts cleared", "success");
                  });
                }}
                className="text-[11px] font-medium text-slate-400 transition hover:text-slate-600"
              >
                Clear resolved conflict history
              </button>
            </div>
          ) : null}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Data on this device" description="IndexedDB is the source of truth for the UI">
          <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-4">
            <Metric label="Transactions" value={counts?.transactions ?? 0} />
            <Metric label="Budgets" value={counts?.budgets ?? 0} />
            <Metric label="Queued ops" value={counts?.queued ?? 0} />
            <Metric
              label="Conflicts"
              value={counts?.conflicts ?? 0}
              warning={(counts?.conflicts ?? 0) > 0}
            />
          </div>
          <div className="space-y-3 p-4 sm:p-5">
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => void exportData()}
                disabled={exporting}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
              >
                {exporting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                Export JSON backup
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-rose-200 px-4 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear local data
              </button>
            </div>
            <p className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[10px] leading-relaxed text-slate-400">
              <HardDrive className="mt-0.5 h-3 w-3 shrink-0" />
              Clearing removes IndexedDB tables on this browser only. The FastAPI database keeps
              its records; a later sync pulls them back down.
            </p>
          </div>
        </SectionCard>

        <SectionCard title="How sync works" description="Idempotent, retry-safe, offline-first">
          <div className="space-y-4 p-4 text-[11px] leading-relaxed text-slate-500 sm:p-5">
            <div className="flex gap-2.5">
              <CloudUpload className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
              <p>
                Every change becomes a queue item with a unique{" "}
                <strong className="font-semibold text-slate-700">operation UUID</strong>. Retrying
                the same operation never creates a duplicate — the server remembers which
                operation IDs it has applied.
              </p>
            </div>
            <div className="flex gap-2.5">
              <Database className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
              <p>
                Records carry a server <strong className="font-semibold text-slate-700">version</strong>{" "}
                and an <strong className="font-semibold text-slate-700">updated_at</strong>{" "}
                timestamp. Deletes are soft tombstones so they replicate instead of vanishing.
              </p>
            </div>
            <div className="flex gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
              <p>
                If two devices edit the same record,{" "}
                <strong className="font-semibold text-slate-700">last write wins</strong> by
                client timestamp (ties go to the server). The losing local edit is kept as a
                conflict above, never silently discarded.
              </p>
            </div>
            <div className="flex gap-2.5">
              <Wifi className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <p>
                The sync engine retries with backoff, listens for online/offline events, and runs
                every 30 seconds while the app is open. A manual sync is always available.
              </p>
            </div>
          </div>
        </SectionCard>
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="Clear all local data?"
        description="This removes transactions, budgets, the sync queue, conflicts and sync cursors from this browser. It does not delete anything on the server. Export a backup first if you might need this device's unsynced changes."
        confirmLabel="Clear local data"
        busy={clearing}
        onConfirm={handleClear}
        onCancel={() => !clearing && setConfirmClear(false)}
      />
    </div>
  );
}

function Metric({
  label,
  value,
  danger,
  warning,
  small,
}: {
  label: string;
  value: string | number;
  danger?: boolean;
  warning?: boolean;
  small?: boolean;
}) {
  return (
    <div className="bg-white px-4 py-3">
      <p
        className={cn(
          "tabular-nums text-slate-900",
          small ? "text-xs font-semibold" : "text-lg font-semibold",
          danger && "text-red-600",
          warning && "text-orange-600",
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>
    </div>
  );
}

function describeRecord(record: Record<string, unknown> | undefined | null): string {
  if (!record || Object.keys(record).length === 0) return "No record returned";
  const title = typeof record.title === "string" ? record.title : null;
  const category = typeof record.category === "string" ? record.category : null;
  const amount = record.amount_paise ?? record.monthly_limit_paise;
  const deleted = record.deleted_at;
  const parts: string[] = [];
  if (title) parts.push(title);
  if (category) parts.push(category === "All" ? "All spending" : category);
  if (typeof amount === "number") parts.push(formatINR(amount));
  if (typeof record.date === "string") parts.push(record.date);
  if (typeof record.month === "number" && typeof record.year === "number") {
    parts.push(`${record.month}/${record.year}`);
  }
  if (deleted) parts.push("deleted");
  return parts.length > 0 ? parts.join(" · ") : "Record details unavailable";
}
