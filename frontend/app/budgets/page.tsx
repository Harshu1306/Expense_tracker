"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  Target,
  TrendingDown,
  Wallet,
} from "lucide-react";
import type { LocalBudget } from "@/types";
import { useAllTransactions, useBudgets } from "@/hooks/useTransactions";
import { BudgetForm } from "@/components/BudgetForm";
import { BudgetProgressCard } from "@/components/BudgetProgressCard";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/ToastProvider";
import {
  EmptyState,
  PageHeader,
  SectionCard,
  StatCard,
  StatCardsSkeleton,
} from "@/components/ui";
import {
  computeBudgetProgress,
  findBudget,
} from "@/services/analytics";
import { deleteBudget } from "@/services/budgets";
import { currentPeriod, monthLabel, shiftMonth } from "@/lib/dates";
import { formatINR, sumPaise } from "@/lib/money";
import { cn } from "@/lib/utils";

export default function BudgetsPage() {
  const { toast } = useToast();
  const [period, setPeriod] = useState(() => currentPeriod());
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LocalBudget | null>(null);
  const [toDelete, setToDelete] = useState<LocalBudget | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { month, year } = period;
  const transactions = useAllTransactions();
  const budgets = useBudgets(month, year);

  const data = useMemo(() => {
    if (!transactions || !budgets) return null;

    const overall = findBudget(budgets, "All", month, year);
    const overallProgress = computeBudgetProgress(overall, transactions, month, year);
    const categoryProgress = budgets
      .filter((budget) => budget.category !== "All")
      .map((budget) => computeBudgetProgress(budget, transactions, month, year))
      .sort((a, b) => b.percentUsed - a.percentUsed);

    const categoryLimitTotal = sumPaise(
      categoryProgress.map((progress) => progress.budget?.monthlyLimitPaise ?? 0),
    );
    const warnings = [overallProgress, ...categoryProgress].filter(
      (progress) => progress.state === "warning" || progress.state === "exceeded",
    );

    return {
      overall: overallProgress,
      categoryProgress,
      categoryLimitTotal,
      warnings,
      spentPaise: overallProgress.spentPaise,
      budgetCount: budgets.length,
    };
  }, [transactions, budgets, month, year]);

  function moveMonth(delta: number) {
    setPeriod((current) => shiftMonth(current.month, current.year, delta));
  }

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(budget: LocalBudget) {
    setEditing(budget);
    setFormOpen(true);
  }

  async function handleDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deleteBudget(toDelete.id);
      toast(
        "Budget removed",
        "success",
        "Deleted locally and queued for sync with a tombstone.",
      );
      setToDelete(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not delete budget.";
      toast("Could not delete budget", "error", message);
    } finally {
      setDeleting(false);
    }
  }

  const thisMonth = currentPeriod();
  const isCurrentMonth = month === thisMonth.month && year === thisMonth.year;

  if (!data) {
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="Planning" title="Budgets" />
        <StatCardsSkeleton />
        <div className="card p-5">
          <div className="skeleton h-40 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  const overallRemaining = data.overall.budget
    ? data.overall.remainingPaise
    : data.categoryLimitTotal - data.spentPaise;
  const hasAnyBudget = data.budgetCount > 0;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Planning"
        title="Budgets"
        description="Set a monthly spending limit for everything or per category. You get a warning at 80% and a clear alert when you go over."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
              <button
                type="button"
                onClick={() => moveMonth(-1)}
                className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-[124px] px-1 text-center text-xs font-semibold text-slate-700">
                {monthLabel(month, year)}
              </span>
              <button
                type="button"
                onClick={() => moveMonth(1)}
                className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            {!isCurrentMonth ? (
              <button
                type="button"
                onClick={() => setPeriod(thisMonth)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                This month
              </button>
            ) : null}
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2.5 text-xs font-semibold text-white shadow-sm shadow-blue-200 transition hover:bg-blue-700"
            >
              <Plus className="h-3.5 w-3.5" />
              Set budget
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Overall budget"
          value={
            data.overall.budget ? formatINR(data.overall.budget.monthlyLimitPaise) : "Not set"
          }
          hint={data.overall.budget ? "Monthly spending limit" : "Set one to track the month"}
          icon={Target}
          tone="blue"
        />
        <StatCard
          label="Spent this month"
          value={formatINR(data.spentPaise)}
          hint={`${monthLabel(month, year, true)} expenses`}
          icon={TrendingDown}
          tone="violet"
        />
        <StatCard
          label="Remaining"
          value={formatINR(overallRemaining)}
          hint={
            data.overall.budget
              ? `${data.overall.percentUsed}% of the overall budget used`
              : data.categoryLimitTotal > 0
                ? "Across category budgets"
                : "No limit set"
          }
          icon={Wallet}
          tone={overallRemaining < 0 ? "rose" : "emerald"}
        />
        <StatCard
          label="Budgets active"
          value={String(data.budgetCount)}
          hint={
            data.categoryLimitTotal > 0
              ? `${formatINR(data.categoryLimitTotal)} in category limits`
              : "Category limits are optional"
          }
          icon={CalendarDays}
          tone="amber"
        />
      </div>

      {data.warnings.length > 0 ? (
        <div
          className={cn(
            "rounded-2xl border p-4 sm:p-5",
            data.warnings.some((warning) => warning.state === "exceeded")
              ? "border-rose-200 bg-rose-50"
              : "border-amber-200 bg-amber-50",
          )}
        >
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                data.warnings.some((warning) => warning.state === "exceeded")
                  ? "bg-rose-100 text-rose-600"
                  : "bg-amber-100 text-amber-600",
              )}
            >
              <AlertTriangle className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-900">
                {data.warnings.some((warning) => warning.state === "exceeded")
                  ? "A budget has been exceeded"
                  : "You're approaching a budget limit"}
              </h2>
              <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-slate-600">
                {data.warnings.map((warning) => (
                  <li key={warning.budget?.id}>
                    <span className="font-semibold text-slate-800">
                      {warning.budget?.category === "All"
                        ? "Overall budget"
                        : `${warning.budget?.category} budget`}
                    </span>{" "}
                    — {warning.percentUsed}% used,{" "}
                    {warning.remainingPaise < 0
                      ? `${formatINR(Math.abs(warning.remainingPaise))} over`
                      : `${formatINR(warning.remainingPaise)} left`}
                    .
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      {!hasAnyBudget ? (
        <div className="card">
          <EmptyState
            icon={Target}
            title={`No budgets for ${monthLabel(month, year)}`}
            description="Start with an overall monthly limit, then add category budgets where you want tighter control. Budgets work offline and sync automatically."
            action={
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-700"
              >
                <Plus className="h-3.5 w-3.5" />
                Set your first budget
              </button>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-1">
            <BudgetProgressCard
              progress={data.overall}
              onEdit={data.overall.budget ? () => openEdit(data.overall.budget!) : openCreate}
              onDelete={
                data.overall.budget ? () => setToDelete(data.overall.budget!) : undefined
              }
              onAdd={openCreate}
            />
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-slate-900">How budgets work</h2>
              <ul className="mt-3 space-y-2.5 text-[11px] leading-relaxed text-slate-500">
                <li className="flex gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                  Budgets are per month. Copy your plan forward by setting a new limit next month.
                </li>
                <li className="flex gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                  Only expenses count toward a budget; income is ignored.
                </li>
                <li className="flex gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                  You&apos;ll see a warning at 80% and an alert after crossing 100%.
                </li>
                <li className="flex gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" />
                  Deletes are tombstones, so they sync correctly to other devices.
                </li>
              </ul>
            </div>
          </div>

          <SectionCard
            title="Category budgets"
            description={
              data.categoryProgress.length > 0
                ? `${data.categoryProgress.length} active for ${monthLabel(month, year, true)}`
                : "Optional limits for specific categories"
            }
            className="lg:col-span-2"
            action={
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-blue-600 transition hover:bg-blue-50"
              >
                <Plus className="h-3 w-3" />
                Add
              </button>
            }
          >
            {data.categoryProgress.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
                {data.categoryProgress.map((progress) => (
                  <BudgetProgressCard
                    key={progress.budget?.id}
                    progress={progress}
                    onEdit={
                      progress.budget ? () => openEdit(progress.budget!) : undefined
                    }
                    onDelete={
                      progress.budget ? () => setToDelete(progress.budget!) : undefined
                    }
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                compact
                icon={Target}
                title="No category budgets"
                description="Add a limit for a category like Food or Shopping to keep it in check."
                action={
                  <button
                    type="button"
                    onClick={openCreate}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-blue-700"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add category budget
                  </button>
                }
              />
            )}
          </SectionCard>
        </div>
      )}

      <BudgetForm
        open={formOpen}
        month={month}
        year={year}
        existingCategories={(budgets ?? []).map((budget) => budget.category)}
        initial={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
      />

      <ConfirmDialog
        open={toDelete !== null}
        title="Delete this budget?"
        description={
          toDelete
            ? `The ${toDelete.category === "All" ? "overall" : toDelete.category} budget of ${formatINR(toDelete.monthlyLimitPaise)} for ${monthLabel(toDelete.month, toDelete.year)} will be removed. Your transactions stay untouched.`
            : undefined
        }
        confirmLabel="Delete budget"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => !deleting && setToDelete(null)}
      />
    </div>
  );
}
