"use client";

import type {
  BudgetProgress,
  BudgetState,
  Category,
  LocalBudget,
  LocalTransaction,
} from "@/types";
import { CATEGORY_META } from "@/lib/categories";
import {
  currentPeriod,
  daysInMonth,
  isInMonth,
  lastNDays,
  lastNMonths,
  monthKey,
} from "@/lib/dates";
import { percentOf, sumPaise } from "@/lib/money";

export interface MonthlyPointLocal {
  month: number;
  year: number;
  label: string;
  shortLabel: string;
  incomePaise: number;
  expensePaise: number;
}

export interface CategorySlice {
  category: Category;
  totalPaise: number;
  count: number;
  percent: number;
  color: string;
}

export interface WeeklyPointLocal {
  date: string;
  label: string;
  dayNumber: number;
  expensePaise: number;
}

export interface SpendingSummary {
  avgDailyPaise: number;
  projectedPaise: number;
  savingsRate: number;
  topCategory: Category | null;
  topCategoryPaise: number;
  daysElapsed: number;
  daysInMonth: number;
}

export interface DashboardData {
  totalBalancePaise: number;
  totalIncomePaise: number;
  totalExpensePaise: number;
  thisMonthExpensePaise: number;
  thisMonthIncomePaise: number;
  transactionCount: number;
  month: number;
  year: number;
  budget: BudgetProgress;
  categoryBudgets: BudgetProgress[];
  monthly: MonthlyPointLocal[];
  categories: CategorySlice[];
  weekly: WeeklyPointLocal[];
  spending: SpendingSummary;
  recent: LocalTransaction[];
}

export function activeTransactions(transactions: LocalTransaction[]): LocalTransaction[] {
  return transactions.filter((transaction) => transaction.deletedAt === null);
}

export function activeBudgets(budgets: LocalBudget[]): LocalBudget[] {
  return budgets.filter((budget) => budget.deletedAt === null);
}

export function findBudget(
  budgets: LocalBudget[],
  category: "All" | Category,
  month: number,
  year: number,
): LocalBudget | null {
  return (
    activeBudgets(budgets).find(
      (budget) =>
        budget.category === category && budget.month === month && budget.year === year,
    ) ?? null
  );
}

export function budgetState(spentPaise: number, limitPaise: number): BudgetState {
  if (limitPaise <= 0) return "none";
  if (spentPaise >= limitPaise) return "exceeded";
  if (spentPaise >= limitPaise * 0.8) return "warning";
  return "ok";
}

export function spentForBudget(
  transactions: LocalTransaction[],
  budget: Pick<LocalBudget, "category" | "month" | "year">,
): number {
  return sumPaise(
    activeTransactions(transactions)
      .filter(
        (transaction) =>
          transaction.type === "expense" &&
          isInMonth(transaction.date, budget.month, budget.year) &&
          (budget.category === "All" || transaction.category === budget.category),
      )
      .map((transaction) => transaction.amountPaise),
  );
}

export function computeBudgetProgress(
  budget: LocalBudget | null,
  transactions: LocalTransaction[],
  month: number,
  year: number,
): BudgetProgress {
  if (!budget) {
    const spent = spentForBudget(transactions, { category: "All", month, year });
    return {
      budget: null,
      spentPaise: spent,
      remainingPaise: 0,
      percentUsed: 0,
      state: "none",
    };
  }
  const spent = spentForBudget(transactions, budget);
  return {
    budget,
    spentPaise: spent,
    remainingPaise: budget.monthlyLimitPaise - spent,
    percentUsed: percentOf(spent, budget.monthlyLimitPaise),
    state: budgetState(spent, budget.monthlyLimitPaise),
  };
}

export function computeMonthlySeries(
  transactions: LocalTransaction[],
  count: number,
  reference = new Date(),
): MonthlyPointLocal[] {
  const active = activeTransactions(transactions);
  return lastNMonths(count, reference).map((period) => {
    const prefix = monthKey(period.year, period.month);
    let incomePaise = 0;
    let expensePaise = 0;
    for (const transaction of active) {
      if (!transaction.date.startsWith(prefix)) continue;
      if (transaction.type === "income") incomePaise += transaction.amountPaise;
      else expensePaise += transaction.amountPaise;
    }
    return {
      ...period,
      incomePaise,
      expensePaise,
    };
  });
}

export function computeCategoryBreakdown(
  transactions: LocalTransaction[],
  month: number,
  year: number,
): CategorySlice[] {
  const totals = new Map<Category, { totalPaise: number; count: number }>();
  for (const transaction of activeTransactions(transactions)) {
    if (transaction.type !== "expense") continue;
    if (!isInMonth(transaction.date, month, year)) continue;
    const current = totals.get(transaction.category) ?? { totalPaise: 0, count: 0 };
    current.totalPaise += transaction.amountPaise;
    current.count += 1;
    totals.set(transaction.category, current);
  }
  const total = sumPaise([...totals.values()].map((entry) => entry.totalPaise));
  return [...totals.entries()]
    .map(([category, entry]) => ({
      category,
      totalPaise: entry.totalPaise,
      count: entry.count,
      percent: percentOf(entry.totalPaise, total),
      color: CATEGORY_META[category].color,
    }))
    .sort((a, b) => b.totalPaise - a.totalPaise);
}

export function computeWeeklySeries(
  transactions: LocalTransaction[],
  days: number,
  reference = new Date(),
): WeeklyPointLocal[] {
  const active = activeTransactions(transactions);
  return lastNDays(days, reference).map((day) => {
    const expensePaise = sumPaise(
      active
        .filter(
          (transaction) =>
            transaction.type === "expense" && transaction.date === day.date,
        )
        .map((transaction) => transaction.amountPaise),
    );
    return { ...day, expensePaise };
  });
}

export function computeSpendingSummary(
  transactions: LocalTransaction[],
  reference = new Date(),
): SpendingSummary {
  const { month, year } = currentPeriod(reference);
  const active = activeTransactions(transactions);
  const monthExpenses = active.filter(
    (transaction) =>
      transaction.type === "expense" && isInMonth(transaction.date, month, year),
  );
  const monthIncome = sumPaise(
    active
      .filter(
        (transaction) =>
          transaction.type === "income" && isInMonth(transaction.date, month, year),
      )
      .map((transaction) => transaction.amountPaise),
  );
  const spent = sumPaise(monthExpenses.map((transaction) => transaction.amountPaise));
  const daysElapsed = Math.max(
    1,
    reference.getMonth() === month - 1 && reference.getFullYear() === year
      ? reference.getDate()
      : daysInMonth(year, month),
  );
  const totalDays = daysInMonth(year, month);
  const avgDailyPaise = Math.round(spent / daysElapsed);
  const breakdown = computeCategoryBreakdown(transactions, month, year);
  const top = breakdown[0] ?? null;

  return {
    avgDailyPaise,
    projectedPaise: avgDailyPaise * totalDays,
    savingsRate:
      monthIncome > 0 ? Math.round(((monthIncome - spent) / monthIncome) * 100) : 0,
    topCategory: top?.category ?? null,
    topCategoryPaise: top?.totalPaise ?? 0,
    daysElapsed,
    daysInMonth: totalDays,
  };
}

export function computeDashboard(
  transactions: LocalTransaction[],
  budgets: LocalBudget[],
  reference = new Date(),
): DashboardData {
  const active = activeTransactions(transactions);
  const { month, year } = currentPeriod(reference);
  const totalIncomePaise = sumPaise(
    active.filter((transaction) => transaction.type === "income").map((t) => t.amountPaise),
  );
  const totalExpensePaise = sumPaise(
    active.filter((transaction) => transaction.type === "expense").map((t) => t.amountPaise),
  );
  const thisMonthExpensePaise = sumPaise(
    active
      .filter(
        (transaction) =>
          transaction.type === "expense" && isInMonth(transaction.date, month, year),
      )
      .map((transaction) => transaction.amountPaise),
  );
  const thisMonthIncomePaise = sumPaise(
    active
      .filter(
        (transaction) =>
          transaction.type === "income" && isInMonth(transaction.date, month, year),
      )
      .map((transaction) => transaction.amountPaise),
  );

  const overall = findBudget(budgets, "All", month, year);
  const categoryBudgets = activeBudgets(budgets)
    .filter((budget) => budget.month === month && budget.year === year && budget.category !== "All")
    .map((budget) => computeBudgetProgress(budget, transactions, month, year))
    .sort((a, b) => b.percentUsed - a.percentUsed);

  const recent = [...active]
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return a.createdAt < b.createdAt ? 1 : -1;
    })
    .slice(0, 6);

  return {
    totalBalancePaise: totalIncomePaise - totalExpensePaise,
    totalIncomePaise,
    totalExpensePaise,
    thisMonthExpensePaise,
    thisMonthIncomePaise,
    transactionCount: active.length,
    month,
    year,
    budget: computeBudgetProgress(overall, transactions, month, year),
    categoryBudgets,
    monthly: computeMonthlySeries(transactions, 6, reference),
    categories: computeCategoryBreakdown(transactions, month, year),
    weekly: computeWeeklySeries(transactions, 7, reference),
    spending: computeSpendingSummary(transactions, reference),
    recent,
  };
}

export function filterTransactions(
  transactions: LocalTransaction[],
  filters: {
    q: string;
    type: "all" | "income" | "expense";
    category: "all" | Category;
    startDate: string;
    endDate: string;
    sort: "date_desc" | "date_asc" | "amount_desc" | "amount_asc";
  },
): LocalTransaction[] {
  const query = filters.q.trim().toLowerCase();
  const filtered = activeTransactions(transactions).filter((transaction) => {
    if (filters.type !== "all" && transaction.type !== filters.type) return false;
    if (filters.category !== "all" && transaction.category !== filters.category) return false;
    if (filters.startDate && transaction.date < filters.startDate) return false;
    if (filters.endDate && transaction.date > filters.endDate) return false;
    if (query) {
      const haystack = `${transaction.title} ${transaction.notes} ${transaction.category}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  return filtered.sort((a, b) => {
    switch (filters.sort) {
      case "date_asc":
        return a.date === b.date
          ? a.createdAt.localeCompare(b.createdAt)
          : a.date.localeCompare(b.date);
      case "amount_asc":
        return a.amountPaise - b.amountPaise;
      case "amount_desc":
        return b.amountPaise - a.amountPaise;
      case "date_desc":
      default:
        return a.date === b.date
          ? b.createdAt.localeCompare(a.createdAt)
          : b.date.localeCompare(a.date);
    }
  });
}
