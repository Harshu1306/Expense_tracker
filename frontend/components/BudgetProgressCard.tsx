"use client";

import Link from "next/link";
import { AlertTriangle, Pencil, Plus, Target, Trash2 } from "lucide-react";
import type { BudgetProgress } from "@/types";
import { CategoryIcon } from "@/components/CategoryIcon";
import { formatINR } from "@/lib/money";
import { cn } from "@/lib/utils";

const STATE_STYLES = {
  ok: {
    bar: "bg-emerald-500",
    text: "text-emerald-600",
    soft: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  warning: {
    bar: "bg-amber-500",
    text: "text-amber-600",
    soft: "bg-amber-50 text-amber-800 border-amber-200",
  },
  exceeded: {
    bar: "bg-rose-500",
    text: "text-rose-600",
    soft: "bg-rose-50 text-rose-700 border-rose-200",
  },
  none: {
    bar: "bg-blue-500",
    text: "text-blue-600",
    soft: "bg-blue-50 text-blue-700 border-blue-200",
  },
} as const;

export function BudgetProgressCard({
  progress,
  onEdit,
  onDelete,
  onAdd,
  className,
}: {
  progress: BudgetProgress;
  onEdit?: () => void;
  onDelete?: () => void;
  onAdd?: () => void;
  className?: string;
}) {
  const { budget, spentPaise, remainingPaise, percentUsed, state } = progress;

  if (!budget) {
    return (
      <div className={cn("card flex flex-col p-5", className)}>
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Target className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Monthly budget</h2>
            <p className="text-[11px] text-slate-400">Keep spending intentional</p>
          </div>
        </div>
        <div className="mt-5 flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center">
          <p className="text-xs font-medium text-slate-500">No budget set for this month</p>
          <p className="mt-1 max-w-[220px] text-[11px] leading-relaxed text-slate-400">
            Set a monthly limit to track your remaining money and get a warning at 80%.
          </p>
          {onAdd ? (
            <button
              type="button"
              onClick={onAdd}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700"
            >
              <Plus className="h-3.5 w-3.5" />
              Set budget
            </button>
          ) : (
            <Link
              href="/budgets"
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700"
            >
              <Plus className="h-3.5 w-3.5" />
              Set budget
            </Link>
          )}
        </div>
      </div>
    );
  }

  const styles = STATE_STYLES[state];
  const clamped = Math.min(Math.max(percentUsed, 0), 100);
  const isOverall = budget.category === "All";
  const category = budget.category;

  return (
    <div className={cn("card flex flex-col p-5", className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          {category === "All" ? (
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Target className="h-4 w-4" />
            </span>
          ) : (
            <CategoryIcon category={category} />
          )}
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              {isOverall ? "Monthly budget" : `${budget.category} budget`}
            </h2>
            <p className="text-[11px] text-slate-400">
              {isOverall ? "Overall spending limit" : "Category spending limit"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          {onEdit ? (
            <button
              type="button"
              onClick={onEdit}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-blue-50 hover:text-blue-600"
              aria-label="Edit budget"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
              aria-label="Delete budget"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-5 flex items-end justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Spent
          </p>
          <p className="mt-0.5 text-xl font-semibold tabular-nums text-slate-900">
            {formatINR(spentPaise)}
          </p>
        </div>
        <p className="pb-0.5 text-xs text-slate-400">
          of <span className="font-medium text-slate-600">{formatINR(budget.monthlyLimitPaise)}</span>
        </p>
      </div>

      <div className="relative mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn("h-full rounded-full transition-all duration-500", styles.bar)}
          style={{ width: `${clamped}%` }}
        />
        <span
          className="absolute inset-y-0 left-[80%] w-px bg-white/80"
          aria-hidden
          title="80% warning threshold"
        />
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px]">
        <span className={cn("font-semibold", styles.text)}>{percentUsed}% used</span>
        <span
          className={cn(
            "font-medium",
            remainingPaise < 0 ? "text-rose-600" : "text-slate-500",
          )}
        >
          {remainingPaise < 0
            ? `${formatINR(Math.abs(remainingPaise))} over`
            : `${formatINR(remainingPaise)} left`}
        </span>
      </div>

      {state === "warning" ? (
        <p className={cn("mt-4 flex items-start gap-2 rounded-xl border px-3 py-2 text-[11px] font-medium", styles.soft)}>
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          You&apos;ve reached 80% of this budget. Slow down to stay within your limit.
        </p>
      ) : null}
      {state === "exceeded" ? (
        <p className={cn("mt-4 flex items-start gap-2 rounded-xl border px-3 py-2 text-[11px] font-medium", styles.soft)}>
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Budget exceeded by {formatINR(Math.abs(remainingPaise))}. Consider adjusting your plan.
        </p>
      ) : null}
    </div>
  );
}
