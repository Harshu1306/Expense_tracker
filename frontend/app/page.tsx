"use client";

import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  PiggyBank,
  Plus,
  ReceiptText,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useDashboardData } from "@/hooks/useSync";
import { CategoryIcon } from "@/components/CategoryIcon";
import { BudgetProgressCard } from "@/components/BudgetProgressCard";
import { MonthlyChart, CategoryPieChart, WeeklyChart } from "@/components/Charts";
import { TransactionItem } from "@/components/TransactionItem";
import {
  ChartSkeleton,
  EmptyState,
  ListSkeleton,
  PageHeader,
  SectionCard,
  StatCard,
  StatCardsSkeleton,
} from "@/components/ui";
import { formatINR } from "@/lib/money";
import { formatDate, monthLabel, todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  const data = useDashboardData();

  if (!data) {
    return (
      <div>
        <PageHeader
          eyebrow="Overview"
          title="Dashboard"
          description="Your money at a glance."
        />
        <StatCardsSkeleton />
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <ChartSkeleton className="lg:col-span-2" />
          <ChartSkeleton />
          <ChartSkeleton />
          <ChartSkeleton />
          <ChartSkeleton />
        </div>
      </div>
    );
  }

  const month = monthLabel(data.month, data.year);
  const monthlyHasData = data.monthly.some(
    (point) => point.incomePaise > 0 || point.expensePaise > 0,
  );
  const weeklyTotal = data.weekly.reduce((total, point) => total + point.expensePaise, 0);
  const categoryTotal = data.categories.reduce((total, slice) => total + slice.totalPaise, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={`${month} overview`}
        title="Dashboard"
        description="A clear view of your money — stored on this device and synced automatically."
        actions={
          <>
            <Link
              href="/analytics"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Analytics
            </Link>
            <Link
              href="/transactions/new"
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2.5 text-xs font-semibold text-white shadow-sm shadow-blue-200 transition hover:bg-blue-700"
            >
              <Plus className="h-3.5 w-3.5" />
              Add transaction
            </Link>
          </>
        }
      />

      {data.transactionCount === 0 ? (
        <div className="overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-600 via-blue-600 to-violet-600 p-6 text-white shadow-lg shadow-blue-200/50 sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-xl">
              <p className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider">
                <Sparkles className="h-3 w-3" />
                Offline-first from day one
              </p>
              <h2 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">
                Start tracking your money in 10 seconds
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-blue-100">
                Add an expense or income. It saves instantly on this device — no internet
                required — and syncs to your server whenever you&apos;re online.
              </p>
            </div>
            <Link
              href="/transactions/new"
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-blue-700 shadow-sm transition hover:bg-blue-50"
            >
              <Plus className="h-4 w-4" />
              Add your first transaction
            </Link>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total balance"
          value={formatINR(data.totalBalancePaise)}
          hint={`${data.transactionCount} transactions · income minus expenses`}
          icon={Wallet}
          tone="blue"
        />
        <StatCard
          label="Total income"
          value={formatINR(data.totalIncomePaise)}
          hint="All-time earnings"
          icon={TrendingUp}
          tone="emerald"
        />
        <StatCard
          label="Total expenses"
          value={formatINR(data.totalExpensePaise)}
          hint="All-time spending"
          icon={TrendingDown}
          tone="violet"
        />
        <StatCard
          label="This month's expenses"
          value={formatINR(data.thisMonthExpensePaise)}
          hint={`${month} · ${formatDate(todayISO())}`}
          icon={CalendarDays}
          tone="rose"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard
          title="Income vs expenses"
          description="Last 6 months"
          className="lg:col-span-2"
          action={
            <Link
              href="/analytics"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700"
            >
              Details <ArrowRight className="h-3 w-3" />
            </Link>
          }
        >
          {monthlyHasData ? (
            <MonthlyChart data={data.monthly} />
          ) : (
            <EmptyState
              compact
              icon={BarChart3}
              title="No monthly activity yet"
              description="Income and expenses will appear here once you add transactions."
            />
          )}
        </SectionCard>

        <SectionCard
          title="Where your money goes"
          description={`${month} expenses by category`}
        >
          {data.categories.length > 0 ? (
            <CategoryPieChart data={data.categories} totalPaise={categoryTotal} />
          ) : (
            <EmptyState
              compact
              icon={Target}
              title="No expenses this month"
              description="Category insights will appear after your first expense."
            />
          )}
        </SectionCard>

        <SectionCard title="Weekly spending" description="Last 7 days">
          {weeklyTotal > 0 ? (
            <WeeklyChart data={data.weekly} />
          ) : (
            <EmptyState
              compact
              icon={CalendarDays}
              title="A quiet week"
              description="No expenses recorded in the last seven days."
            />
          )}
        </SectionCard>

        <BudgetProgressCard progress={data.budget} />

        <SectionCard title="Spending summary" description={`${month} at a glance`}>
          <div className="grid grid-cols-2 gap-px bg-slate-100">
            <SummaryTile
              label="Daily average"
              value={formatINR(data.spending.avgDailyPaise)}
              hint={`Day ${data.spending.daysElapsed} of ${data.spending.daysInMonth}`}
              icon={ReceiptText}
            />
            <SummaryTile
              label="Projected month"
              value={formatINR(data.spending.projectedPaise)}
              hint="At your current pace"
              icon={TrendingUp}
            />
            <SummaryTile
              label="Savings rate"
              value={`${data.spending.savingsRate}%`}
              hint="Of this month's income"
              icon={PiggyBank}
              tone={data.spending.savingsRate >= 0 ? "text-emerald-600" : "text-rose-600"}
            />
            <SummaryTile
              label="Top category"
              value={data.spending.topCategory ?? "—"}
              hint={
                data.spending.topCategory
                  ? formatINR(data.spending.topCategoryPaise)
                  : "No expenses yet"
              }
              icon={Target}
              category={data.spending.topCategory}
            />
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
            <p className="text-[11px] text-slate-400">
              Income this month:{" "}
              <span className="font-semibold text-emerald-600">
                {formatINR(data.thisMonthIncomePaise)}
              </span>
            </p>
            <Link
              href="/analytics"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700"
            >
              Full report <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        </SectionCard>
      </div>

      {data.categoryBudgets.length > 0 ? (
        <SectionCard
          title="Category budgets"
          description={`${month} · ${data.categoryBudgets.length} active`}
          action={
            <Link
              href="/budgets"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700"
            >
              Manage <ArrowRight className="h-3 w-3" />
            </Link>
          }
        >
          <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.categoryBudgets.map((progress) => (
              <BudgetProgressCard key={progress.budget?.id} progress={progress} />
            ))}
          </div>
        </SectionCard>
      ) : null}

      <SectionCard
        title="Recent transactions"
        description="Latest activity across all categories"
        action={
          <Link
            href="/transactions"
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700"
          >
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        }
      >
        {data.recent.length > 0 ? (
          <ul className="divide-y divide-slate-100">
            {data.recent.map((transaction) => (
              <TransactionItem key={transaction.id} transaction={transaction} compact />
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={ReceiptText}
            title="No transactions yet"
            description="Add your first income or expense and it will show up here instantly."
            action={
              <Link
                href="/transactions/new"
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-700"
              >
                <Plus className="h-3.5 w-3.5" />
                Add transaction
              </Link>
            }
          />
        )}
      </SectionCard>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  category,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: string;
  category?: "Food" | "Transportation" | "Shopping" | "Education" | "Entertainment" | "Healthcare" | "Bills" | "Travel" | "Personal" | "Others" | null;
}) {
  return (
    <div className="bg-white p-4">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        {category ? <CategoryIcon category={category} size="sm" /> : null}
        <p className={cn("truncate text-sm font-semibold tabular-nums text-slate-900", tone)}>
          {value}
        </p>
      </div>
      <p className="mt-0.5 truncate text-[10px] text-slate-400">{hint}</p>
    </div>
  );
}
