"use client";

import { useEffect, useMemo, useState } from "react";
import { IndianRupee, Loader2, Target, X } from "lucide-react";
import { CATEGORIES } from "@/types";
import type { Category, LocalBudget } from "@/types";
import { CategoryIcon } from "@/components/CategoryIcon";
import { useToast } from "@/components/ToastProvider";
import { setBudget, updateBudgetLimit } from "@/services/budgets";
import { parseRupeesToPaise, paiseToInput } from "@/lib/money";
import { monthLabel } from "@/lib/dates";
import { cn } from "@/lib/utils";

export function BudgetForm({
  open,
  month,
  year,
  existingCategories,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  month: number;
  year: number;
  existingCategories: string[];
  initial?: LocalBudget | null;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { toast } = useToast();
  const [category, setCategory] = useState<"All" | Category>("All");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const available = useMemo(() => {
    const options: Array<"All" | Category> = ["All", ...CATEGORIES];
    return options.filter(
      (option) =>
        option === initial?.category ||
        !existingCategories.includes(option) ||
        (initial ? false : option === "All" && !existingCategories.includes("All")),
    );
  }, [existingCategories, initial]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSaving(false);
    if (initial) {
      setCategory(initial.category);
      setAmount(paiseToInput(initial.monthlyLimitPaise));
    } else {
      setCategory(available[0] ?? "All");
      setAmount("");
    }
  }, [open, initial, available]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, saving, onClose]);

  if (!open) return null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const paise = parseRupeesToPaise(amount);
    if (paise === null) {
      setError("Enter a valid budget amount greater than ₹0.");
      return;
    }
    setSaving(true);
    try {
      if (initial) {
        await updateBudgetLimit(initial.id, paise);
      } else {
        await setBudget({ category, monthlyLimitPaise: paise, month, year });
      }
      toast(
        initial ? "Budget updated" : "Budget set",
        "success",
        "Saved locally and queued for sync.",
      );
      onSaved?.();
      onClose();
    } catch (saveError) {
      const message =
        saveError instanceof Error ? saveError.message : "Could not save the budget.";
      setError(message);
      toast("Could not save budget", "error", message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={() => !saving && onClose()}
        aria-label="Close budget dialog"
      />
      <form
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="budget-dialog-title"
        className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl animate-fade-up"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Target className="h-5 w-5" />
            </span>
            <div>
              <h2 id="budget-dialog-title" className="text-base font-semibold text-slate-900">
                {initial ? "Edit budget" : "Set a monthly budget"}
              </h2>
              <p className="text-[11px] text-slate-400">{monthLabel(month, year)}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <span className="mb-2 block text-xs font-semibold text-slate-600">
              Budget for
            </span>
            {initial ? (
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
                {initial.category === "All" ? (
                  <Target className="h-4 w-4 text-blue-600" />
                ) : (
                  <CategoryIcon category={initial.category} size="sm" />
                )}
                {initial.category === "All" ? "All spending" : initial.category}
              </div>
            ) : (
              <div className="grid max-h-48 grid-cols-2 gap-2 overflow-y-auto pr-1">
                {available.map((option) => {
                  const active = category === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setCategory(option)}
                      aria-pressed={active}
                      className={cn(
                        "flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-xs font-medium transition",
                        active
                          ? "border-blue-300 bg-blue-50 text-blue-700 ring-1 ring-blue-200"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50",
                      )}
                    >
                      {option === "All" ? (
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                          <Target className="h-3.5 w-3.5" />
                        </span>
                      ) : (
                        <CategoryIcon category={option} size="sm" />
                      )}
                      <span className="truncate">
                        {option === "All" ? "All spending" : option}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label htmlFor="budget-amount" className="mb-1.5 block text-xs font-semibold text-slate-600">
              Monthly limit
            </label>
            <div className="relative">
              <IndianRupee className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="budget-amount"
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
                className="field pl-9 text-base font-semibold tabular-nums"
                autoFocus
                autoComplete="off"
              />
            </div>
          </div>

          {error ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              {error}
            </p>
          ) : null}
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {saving ? "Saving…" : initial ? "Update budget" : "Set budget"}
          </button>
        </div>
      </form>
    </div>
  );
}
