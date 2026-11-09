"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  PiggyBank,
  Plus,
  ReceiptText,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { CategoryPieChart, MonthlyChart, WeeklyChart } from "@/components/Charts";
import { CategoryIcon } from "@/components/CategoryIcon";
import { BudgetProgressCard } from "@/components/BudgetProgressCard";
import {
  ChartSkeleton,
  EmptyState,
  PageHeader,
  SectionCard,
  StatCard,
  StatCardsSkeleton,
} from "@/components/ui";
import { useAllBudgets, useAllTransactions } from "@/hooks/useTransactions";
import {
  activeTransactions,
  computeBudgetProgress,
  computeCategoryBreakdown,
  computeMonthlySeries,
  computeSpendingSummary,
  computeWeeklySeries,
  findBudget,
} from "@/services/analytics";
import { currentPeriod, isInMonth, monthLabel, shiftMonth } from "@/lib/dates";
import { formatINR, sumPaise } from "@/lib/money";
import { cn } from "@/lib/utils";

export default function AnalyticsPage() {
  const transactions = useAllTransactions();
  const budgets = useAllBudgets();
  const [period, setPeriod] = useState(() => currentPeriod());

  const { month, year } = period;
  const thisMonth = currentPeriod();
  const isCurrentMonth = month === thisMonth.month && year === thisMonth.year;

  const data = useMemo(() => {
    if (!transactions || !budgets) return null;

    const reference = new Date(year, month - 1, 1);
    const weeklyReference = isCurrentMonth ? new Date() : new Date(year, month, 0);
    const monthTransactions = activeTransactions(transactions).filter((transaction) =>
      isInMonth(transaction.date, month, year),
    );

    const incomePaise = sumPaise(
      monthTransactions
        .filter((transaction) => transaction.type === "income")
        .map((transaction) => transaction.amountPaise),
    );
    const expensePaise = sumPaise(
      monthTransactions
        .filter((transaction) => transaction.type === "expense")
        .map((transaction) => transaction.amountPaise),
    );

    const categories = computeCategoryBreakdown(transactions, month, year);
    const overallBudget = findBudget(budgets, "All", month, year);
    const categoryBudgets = new Map(
      budgets
        .filter(
          (budget) =>
            budget.deletedAt === null &&
            budget.month === month &&
            budget.year === year &&
            budget.category !== "All",
        )
        .map((budget) => [
          budget.category,
          computeBudgetProgress(budget, transactions, month, year),
        ]),
    );

    return {
      monthTransactions,
      incomePaise,
      expensePaise,
      netPaise: incomePaise - expensePaise,
      monthly: computeMonthlySeries(transactions, 6, reference),
      categories,
      weekly: computeWeeklySeries(transactions, 7, weeklyReference),
      spending: computeSpendingSummary(transactions, reference),
      budget: computeBudgetProgress(overallBudget, transactions, month, year),
      categoryBudgets,
    };
  }, [transactions, budgets, month, year, isCurrentMonth]);

  function moveMonth(delta: number) {
    setPeriod((current) => shiftMonth(current.month, current.year, delta));
  }

  if (!data) {
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="Insights" title="Analytics" />
        <StatCardsSkeleton />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <ChartSkeleton className="lg:col-span-2" />
          <ChartSkeleton />
          <ChartSkeleton className="lg:col-span-2" />
          <ChartSkeleton />
        </div>
      </div>
    );
  }

  const monthlyHasData = data.monthly.some(
    (point) => point.incomePaise > 0 || point.expensePaise > 0,
  );
  const weeklyTotal = sumPaise(data.weekly.map((point) => point.expensePaise));
  const categoryTotal = sumPaise(data.categories.map((slice) => slice.totalPaise));
  const savingsRate =
    data.incomePaise > 0
      ? Math.round(((data.incomePaise - data.expensePaise) / data.incomePaise) * 100)
      : 0;
  const hasMonthData = data.monthTransactions.length > 0;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Insights"
        title="Analytics"
        description="Understand where your money goes. Everything is computed on this device, so insights work offline too."
        actions={
          <div className="flex items-center gap-2">
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
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Income"
          value={formatINR(data.incomePaise)}
          hint={`${monthLabel(month, year, true)} earnings`}
          icon={TrendingUp}
          tone="emerald"
        />
        <StatCard
          label="Expenses"
          value={formatINR(data.expensePaise)}
          hint={`${monthLabel(month, year, true)} spending`}
          icon={TrendingDown}
          tone="violet"
        />
        <StatCard
          label="Net saved"
          value={formatINR(data.netPaise)}
          hint={data.incomePaise > 0 ? `${savingsRate}% of income` : "No income recorded"}
          icon={PiggyBank}
          tone={data.netPaise >= 0 ? "blue" : "rose"}
        />
        <StatCard
          label="Transactions"
          value={String(data.monthTransactions.length)}
          hint={hasMonthData ? "Recorded this month" : "Nothing recorded yet"}
          icon={ReceiptText}
          tone="amber"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard
          title="Income vs expenses"
          description={`Six months up to ${monthLabel(month, year)}`}
          className="lg:col-span-2"
        >
          {monthlyHasData ? (
            <MonthlyChart data={data.monthly} />
          ) : (
            <EmptyState
              compact
              icon={BarChart3}
              title="No activity in this window"
              description="Add income or expenses to see how the months compare."
              action={
                <Link
                  href="/transactions/new"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add transaction
                </Link>
              }
            />
          )}
        </SectionCard>

        <SectionCard
          title="Spending summary"
          description={`${monthLabel(month, year)} at a glance`}
        >
          <div className="divide-y divide-slate-100">
            <SummaryRow
              label="Average per day"
              value={formatINR(data.spending.avgDailyPaise)}
              hint={`${data.spending.daysElapsed} of ${data.spending.daysInMonth} days`}
            />
            <SummaryRow
              label="Projected month"
              value={formatINR(data.spending.projectedPaise)}
              hint="At your current pace"
            />
            <SummaryRow
              label="Savings rate"
              value={`${data.spending.savingsRate}%`}
              hint="Of this month's income"
              tone={data.spending.savingsRate >= 0 ? "text-emerald-600" : "text-rose-600"}
            />
            <SummaryRow
              label="Top category"
              value={data.spending.topCategory ?? "—"}
              hint={
                data.spending.topCategory
                  ? formatINR(data.spending.topCategoryPaise)
                  : "No expenses yet"
              }
              category={data.spending.topCategory}
            />
            <SummaryRow
              label="Biggest day"
              value={formatINR(
                data.weekly.reduce((max, point) => Math.max(max, point.expensePaise), 0),
              )}
              hint={isCurrentMonth ? "In the last 7 days" : "In the final week"}
            />
          </div>
        </SectionCard>

        <SectionCard
          title="Category breakdown"
          description={`${monthLabel(month, year)} expenses`}
          className="lg:col-span-2"
        >
          {data.categories.length > 0 ? (
            <CategoryPieChart data={data.categories} totalPaise={categoryTotal} />
          ) : (
            <EmptyState
              compact
              icon={Target}
              title="No expenses this month"
              description="Category insights appear after your first expense in this month."
            />
          )}
        </SectionCard>

        <SectionCard title="Weekly spending" description={isCurrentMonth ? "Last 7 days" : "Final week of the month"}>
          {weeklyTotal > 0 ? (
            <WeeklyChart data={data.weekly} />
          ) : (
            <EmptyState
              compact
              icon={CalendarDays}
              title="A quiet week"
              description="No expenses recorded in this window."
            />
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard
          title="Category detail"
          description="Spend, share of total, and budget health"
          className="lg:col-span-2"
        >
          {data.categories.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {data.categories.map((slice) => {
                const progress = data.categoryBudgets.get(slice.category);
                return (
                  <li key={slice.category} className="px-4 py-3 sm:px-5">
                    <div className="flex items-center gap-3">
                      <CategoryIcon category={slice.category} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {slice.category}
                          </p>
                          <p className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
                            {formatINR(slice.totalPaise)}
                          </p>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${Math.max(slice.percent, 1)}%`,
                                backgroundColor: slice.color,
                              }}
                            />
                          </div>
                          <span className="w-10 text-right text-[10px] tabular-nums text-slate-400">
                            {slice.percent}%
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-400">
                          {slice.count} {slice.count === 1 ? "transaction" : "transactions"}
                          {progress?.budget ? (
                            <>
                              <span className="mx-1.5 text-slate-300">·</span>
                              <span
                                className={cn(
                                  "font-medium",
                                  progress.state === "exceeded"
                                    ? "text-rose-600"
                                    : progress.state === "warning"
                                      ? "text-amber-600"
                                      : "text-emerald-600",
                                )}
                              >
                                {progress.percentUsed}% of {formatINR(progress.budget.monthlyLimitPaise)} budget
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="mx-1.5 text-slate-300">·</span>
                              No budget
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              icon={Target}
              title="No category data"
              description="Add an expense for this month to see the full breakdown."
            />
          )}
        </SectionCard>

        <div className="space-y-4">
          <BudgetProgressCard progress={data.budget} />
          <div className="card p-5">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                <Wallet className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Monthly cash flow</h2>
                <p className="text-[11px] text-slate-400">Income minus expenses</p>
              </div>
            </div>
            <p
              className={cn(
                "mt-4 text-2xl font-semibold tabular-nums",
                data.netPaise >= 0 ? "text-emerald-600" : "text-rose-600",
              )}
            >
              {formatINR(data.netPaise)}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
              {data.netPaise >= 0
                ? "You spent less than you earned this month."
                : "Expenses are higher than income this month."}
            </p>
            <Link
              href="/budgets"
              className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              <Target className="h-3.5 w-3.5" />
              Manage budgets
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  hint,
  tone,
  category,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: string;
  category?: "Food" | "Transportation" | "Shopping" | "Education" | "Entertainment" | "Healthcare" | "Bills" | "Travel" | "Personal" | "Others" | null;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          {label}
        </p>
        <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {category ? <CategoryIcon category={category} size="sm" /> : null}
        <p className={cn("truncate text-sm font-semibold tabular-nums text-slate-900", tone)}>
          {value}
        </p>
      </div>
    </div>
  );
}
