import { describe, expect, it } from "vitest";
import type { LocalBudget, LocalTransaction } from "@/types";
import {
  budgetState,
  computeBudgetProgress,
  computeCategoryBreakdown,
  computeDashboard,
  computeMonthlySeries,
  computeSpendingSummary,
  computeWeeklySeries,
  filterTransactions,
} from "@/services/analytics";

const REFERENCE = new Date(2026, 4, 15, 12, 0, 0); // 15 May 2026

function tx(partial: Partial<LocalTransaction> & Pick<LocalTransaction, "id" | "title">): LocalTransaction {
  const timestamp = partial.createdAt ?? "2026-05-10T10:00:00.000Z";
  return {
    amountPaise: 10000,
    type: "expense",
    category: "Food",
    date: "2026-05-10",
    paymentMethod: "UPI",
    notes: "",
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1,
    deletedAt: null,
    syncState: "synced",
    ...partial,
  };
}

function budget(partial: Partial<LocalBudget> & Pick<LocalBudget, "id">): LocalBudget {
  return {
    category: "All",
    monthlyLimitPaise: 500000,
    month: 5,
    year: 2026,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    version: 1,
    deletedAt: null,
    syncState: "synced",
    ...partial,
  };
}

describe("local analytics", () => {
  const transactions = [
    tx({ id: "1", title: "Salary", amountPaise: 5000000, type: "income", category: "Others", date: "2026-05-01" }),
    tx({ id: "2", title: "Groceries", amountPaise: 120000, category: "Food", date: "2026-05-10" }),
    tx({ id: "3", title: "Bus", amountPaise: 30000, category: "Transportation", date: "2026-05-12" }),
    tx({ id: "4", title: "Old food", amountPaise: 50000, category: "Food", date: "2026-04-20" }),
    tx({ id: "5", title: "December bonus", amountPaise: 100000, type: "income", category: "Others", date: "2025-12-15" }),
    tx({ id: "6", title: "Deleted", amountPaise: 999999, date: "2026-05-13", deletedAt: "2026-05-14T00:00:00.000Z" }),
  ];

  it("computes totals, month figures and recent activity from local data", () => {
    const dashboard = computeDashboard(transactions, [budget({ id: "b1" })], REFERENCE);
    expect(dashboard.totalIncomePaise).toBe(5100000);
    expect(dashboard.totalExpensePaise).toBe(200000);
    expect(dashboard.totalBalancePaise).toBe(4900000);
    expect(dashboard.thisMonthExpensePaise).toBe(150000);
    expect(dashboard.thisMonthIncomePaise).toBe(5000000);
    expect(dashboard.transactionCount).toBe(5);
    expect(dashboard.month).toBe(5);
    expect(dashboard.year).toBe(2026);
    expect(dashboard.recent.map((item) => item.id)).toEqual(["3", "2", "1", "4", "5"]);
  });

  it("computes overall and category budget progress with warning thresholds", () => {
    expect(budgetState(0, 100)).toBe("ok");
    expect(budgetState(79, 100)).toBe("ok");
    expect(budgetState(80, 100)).toBe("warning");
    expect(budgetState(100, 100)).toBe("exceeded");
    expect(budgetState(10, 0)).toBe("none");

    const overall = computeBudgetProgress(
      budget({ id: "b1", monthlyLimitPaise: 200000 }),
      transactions,
      5,
      2026,
    );
    expect(overall.spentPaise).toBe(150000);
    expect(overall.remainingPaise).toBe(50000);
    expect(overall.percentUsed).toBe(75);
    expect(overall.state).toBe("ok");

    const food = computeBudgetProgress(
      budget({ id: "b2", category: "Food", monthlyLimitPaise: 150000 }),
      transactions,
      5,
      2026,
    );
    expect(food.spentPaise).toBe(120000);
    expect(food.percentUsed).toBe(80);
    expect(food.state).toBe("warning");

    const noBudget = computeBudgetProgress(null, transactions, 5, 2026);
    expect(noBudget.spentPaise).toBe(150000);
    expect(noBudget.state).toBe("none");
  });

  it("builds the monthly series and ignores tombstones", () => {
    const monthly = computeMonthlySeries(transactions, 6, REFERENCE);
    expect(monthly).toHaveLength(6);
    expect(monthly.map((point) => point.shortLabel)).toEqual([
      "Dec",
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
    ]);
    const may = monthly[monthly.length - 1];
    expect(may.incomePaise).toBe(5000000);
    expect(may.expensePaise).toBe(150000);
    const april = monthly[monthly.length - 2];
    expect(april.expensePaise).toBe(50000);
  });

  it("builds the category breakdown sorted by spend", () => {
    const categories = computeCategoryBreakdown(transactions, 5, 2026);
    expect(categories.map((slice) => slice.category)).toEqual(["Food", "Transportation"]);
    expect(categories[0].totalPaise).toBe(120000);
    expect(categories[0].count).toBe(1);
    expect(categories[0].percent).toBe(80);
    expect(categories[1].percent).toBe(20);
  });

  it("computes weekly spending and spending summary", () => {
    const weekly = computeWeeklySeries(transactions, 7, REFERENCE);
    expect(weekly).toHaveLength(7);
    expect(weekly[weekly.length - 1].date).toBe("2026-05-15");
    expect(weekly.reduce((total, point) => total + point.expensePaise, 0)).toBe(150000);

    const summary = computeSpendingSummary(transactions, REFERENCE);
    expect(summary.daysElapsed).toBe(15);
    expect(summary.daysInMonth).toBe(31);
    expect(summary.avgDailyPaise).toBe(10000);
    expect(summary.projectedPaise).toBe(310000);
    expect(summary.topCategory).toBe("Food");
    expect(summary.savingsRate).toBe(97);
  });

  it("filters by search, type, category, dates and sorts", () => {
    const search = filterTransactions(transactions, {
      q: "grocer",
      type: "all",
      category: "all",
      startDate: "",
      endDate: "",
      sort: "date_desc",
    });
    expect(search.map((item) => item.id)).toEqual(["2"]);

    const transport = filterTransactions(transactions, {
      q: "",
      type: "expense",
      category: "Transportation",
      startDate: "",
      endDate: "",
      sort: "amount_desc",
    });
    expect(transport.map((item) => item.id)).toEqual(["3"]);

    const may = filterTransactions(transactions, {
      q: "",
      type: "all",
      category: "all",
      startDate: "2026-05-01",
      endDate: "2026-05-31",
      sort: "amount_desc",
    });
    expect(may.map((item) => item.id)).toEqual(["1", "2", "3"]);

    const oldest = filterTransactions(transactions, {
      q: "",
      type: "all",
      category: "all",
      startDate: "",
      endDate: "",
      sort: "date_asc",
    });
    expect(oldest[0].id).toBe("5");
    expect(oldest.some((item) => item.id === "6")).toBe(false);
  });
});
