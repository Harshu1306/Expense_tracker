"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastVariant = "success" | "error" | "info";

interface ToastItem {
  id: number;
  message: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant, description?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextToastId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, variant: ToastVariant = "success", description?: string) => {
      const id = nextToastId++;
      setToasts((current) => [...current, { id, message, description, variant }]);
      window.setTimeout(() => dismiss(id), 4200);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((item) => {
          const Icon =
            item.variant === "success"
              ? CheckCircle2
              : item.variant === "error"
                ? AlertCircle
                : Info;
          return (
            <div
              key={item.id}
              className={cn(
                "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-white p-3.5 shadow-lg animate-fade-up",
                item.variant === "success" && "border-emerald-200",
                item.variant === "error" && "border-red-200",
                item.variant === "info" && "border-blue-200",
              )}
              role="status"
            >
              <Icon
                className={cn(
                  "mt-0.5 h-4.5 w-4.5 shrink-0",
                  item.variant === "success" && "text-emerald-600",
                  item.variant === "error" && "text-red-600",
                  item.variant === "info" && "text-blue-600",
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900">{item.message}</p>
                {item.description ? (
                  <p className="mt-0.5 text-xs text-slate-500">{item.description}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                aria-label="Dismiss notification"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside ToastProvider");
  }
  return context;
}
