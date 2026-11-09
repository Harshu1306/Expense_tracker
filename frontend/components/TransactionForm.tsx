"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Check,
  IndianRupee,
  Loader2,
  Save,
  WifiOff,
  X,
} from "lucide-react";
import { CATEGORIES, PAYMENT_METHODS } from "@/types";
import type { Category, LocalTransaction, TransactionType } from "@/types";
import { CategoryIcon } from "@/components/CategoryIcon";
import { useToast } from "@/components/ToastProvider";
import { createTransaction, updateTransaction } from "@/services/transactions";
import { useSyncStatus } from "@/hooks/useSync";
import { formatINR, parseRupeesToPaise, paiseToInput } from "@/lib/money";
import { todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";

export function TransactionForm({
  initial,
  mode = "create",
}: {
  initial?: LocalTransaction;
  mode?: "create" | "edit";
}) {
  const router = useRouter();
  const { toast } = useToast();
  const sync = useSyncStatus();

  const [type, setType] = useState<TransactionType>(initial?.type ?? "expense");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [amount, setAmount] = useState(initial ? paiseToInput(initial.amountPaise) : "");
  const [category, setCategory] = useState<Category>(initial?.category ?? "Food");
  const [date, setDate] = useState(initial?.date ?? todayISO());
  const [paymentMethod, setPaymentMethod] = useState(initial?.paymentMethod ?? "UPI");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const amountPaise = useMemo(() => parseRupeesToPaise(amount), [amount]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Give this transaction a title.");
      return;
    }
    if (amountPaise === null) {
      setError("Enter a valid amount greater than ₹0 (up to 2 decimal places).");
      return;
    }
    if (!date) {
      setError("Choose a date.");
      return;
    }

    const input = {
      title: title.trim(),
      amountPaise,
      type,
      category,
      date,
      paymentMethod,
      notes: notes.trim(),
    };

    setSaving(true);
    try {
      if (mode === "edit" && initial) {
        await updateTransaction(initial.id, input);
      } else {
        await createTransaction(input);
      }
      toast(
        mode === "edit" ? "Transaction updated" : "Transaction saved",
        "success",
        "Stored on this device instantly. It will sync automatically.",
      );
      router.push("/transactions");
    } catch (saveError) {
      const message =
        saveError instanceof Error ? saveError.message : "Something went wrong while saving.";
      setError(message);
      toast("Could not save transaction", "error", message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1.5">
        {(
          [
            { value: "expense", label: "Expense" },
            { value: "income", label: "Income" },
          ] as const
        ).map((option) => {
          const active = type === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setType(option.value)}
              aria-pressed={active}
              className={cn(
                "rounded-xl px-4 py-2.5 text-sm font-semibold transition",
                active && option.value === "expense" && "bg-white text-rose-600 shadow-sm",
                active && option.value === "income" && "bg-white text-emerald-600 shadow-sm",
                !active && "text-slate-500 hover:text-slate-700",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="tx-title" className="mb-1.5 block text-xs font-semibold text-slate-600">
            Title
          </label>
          <input
            id="tx-title"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={type === "expense" ? "e.g. Groceries at DMart" : "e.g. October salary"}
            maxLength={200}
            className="field"
            autoFocus
            autoComplete="off"
          />
        </div>

        <div>
          <label htmlFor="tx-amount" className="mb-1.5 block text-xs font-semibold text-slate-600">
            Amount
          </label>
          <div className="relative">
            <IndianRupee className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="tx-amount"
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              className="field pl-9 text-base font-semibold tabular-nums"
              autoComplete="off"
            />
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400">
            {amountPaise !== null
              ? `Stored as ${amountPaise.toLocaleString("en-IN")} paise · ${formatINR(amountPaise)}`
              : "Rupees, up to 2 decimal places"}
          </p>
        </div>

        <div>
          <label htmlFor="tx-date" className="mb-1.5 block text-xs font-semibold text-slate-600">
            Date
          </label>
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="tx-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="field pl-9"
              max="2100-12-31"
            />
          </div>
        </div>

        <div className="sm:col-span-2">
          <span className="mb-2 block text-xs font-semibold text-slate-600">Category</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
            {CATEGORIES.map((option) => {
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
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
                  )}
                >
                  <CategoryIcon category={option} size="sm" />
                  <span className="truncate">{option}</span>
                  {active ? <Check className="ml-auto h-3 w-3 shrink-0 text-blue-600" /> : null}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label htmlFor="tx-method" className="mb-1.5 block text-xs font-semibold text-slate-600">
            Payment method
          </label>
          <select
            id="tx-method"
            value={paymentMethod}
            onChange={(event) => setPaymentMethod(event.target.value)}
            className="field"
          >
            {PAYMENT_METHODS.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="tx-notes" className="mb-1.5 block text-xs font-semibold text-slate-600">
            Notes <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <input
            id="tx-notes"
            type="text"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Anything worth remembering"
            maxLength={2000}
            className="field"
            autoComplete="off"
          />
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-medium text-red-700">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
          {sync.online ? (
            <>
              <Save className="h-3.5 w-3.5" />
              Saved locally first, then synced in the background.
            </>
          ) : (
            <>
              <WifiOff className="h-3.5 w-3.5 text-amber-500" />
              You&apos;re offline — this will be queued and synced later.
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/transactions"
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 sm:flex-none"
          >
            <X className="h-4 w-4" />
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-70 sm:flex-none",
              type === "income"
                ? "bg-emerald-600 shadow-emerald-100 hover:bg-emerald-700"
                : "bg-blue-600 shadow-blue-100 hover:bg-blue-700",
            )}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saving ? "Saving…" : mode === "edit" ? "Update transaction" : "Save transaction"}
          </button>
        </div>
      </div>
    </form>
  );
}
