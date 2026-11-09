"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import { CATEGORIES, EMPTY_FILTERS } from "@/types";
import type { TransactionFilters } from "@/types";
import { cn } from "@/lib/utils";

export function FiltersBar({
  filters,
  onChange,
  resultCount,
}: {
  filters: TransactionFilters;
  onChange: (filters: TransactionFilters) => void;
  resultCount?: number;
}) {
  const dirty =
    filters.q !== "" ||
    filters.type !== "all" ||
    filters.category !== "all" ||
    filters.startDate !== "" ||
    filters.endDate !== "" ||
    filters.sort !== "date_desc";

  function patch(values: Partial<TransactionFilters>) {
    onChange({ ...filters, ...values });
  }

  return (
    <div className="card p-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={filters.q}
              onChange={(event) => patch({ q: event.target.value })}
              placeholder="Search title, notes or category…"
              className="field pl-9"
              aria-label="Search transactions"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
            <select
              value={filters.type}
              onChange={(event) =>
                patch({ type: event.target.value as TransactionFilters["type"] })
              }
              className="field min-w-[110px]"
              aria-label="Filter by type"
            >
              <option value="all">All types</option>
              <option value="expense">Expenses</option>
              <option value="income">Income</option>
            </select>
            <select
              value={filters.category}
              onChange={(event) =>
                patch({ category: event.target.value as TransactionFilters["category"] })
              }
              className="field min-w-[130px]"
              aria-label="Filter by category"
            >
              <option value="all">All categories</option>
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="grid flex-1 grid-cols-2 gap-2">
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5">
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                From
              </span>
              <input
                type="date"
                value={filters.startDate}
                onChange={(event) => patch({ startDate: event.target.value })}
                className="w-full min-w-0 border-0 bg-transparent p-0 text-xs text-slate-700 outline-none"
                aria-label="Start date"
              />
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5">
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                To
              </span>
              <input
                type="date"
                value={filters.endDate}
                onChange={(event) => patch({ endDate: event.target.value })}
                className="w-full min-w-0 border-0 bg-transparent p-0 text-xs text-slate-700 outline-none"
                aria-label="End date"
              />
            </label>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:flex-none">
              <SlidersHorizontal className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <select
                value={filters.sort}
                onChange={(event) =>
                  patch({ sort: event.target.value as TransactionFilters["sort"] })
                }
                className="field min-w-[150px] py-1.5 pl-8 text-xs"
                aria-label="Sort transactions"
              >
                <option value="date_desc">Newest first</option>
                <option value="date_asc">Oldest first</option>
                <option value="amount_desc">Highest amount</option>
                <option value="amount_asc">Lowest amount</option>
              </select>
            </div>
            {dirty ? (
              <button
                type="button"
                onClick={() => onChange(EMPTY_FILTERS)}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </button>
            ) : null}
          </div>

          {typeof resultCount === "number" ? (
            <p
              className={cn(
                "text-[11px] font-medium text-slate-400 sm:ml-auto sm:shrink-0",
                dirty && "text-blue-600",
              )}
            >
              {resultCount} {resultCount === 1 ? "result" : "results"}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
