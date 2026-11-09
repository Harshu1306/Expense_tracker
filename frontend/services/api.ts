"use client";

import type {
  ApiBudget,
  ApiSyncChanges,
  ApiSyncOperation,
  ApiSyncResponse,
  ApiTransaction,
} from "@/types/api";
import type { LocalBudget, LocalTransaction } from "@/types";

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(
  /\/$/,
  "",
);

export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(message: string, status = 0, detail: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      let detail: unknown = null;
      try {
        detail = await response.json();
      } catch {
        detail = await response.text().catch(() => null);
      }
      const message =
        typeof detail === "object" && detail && "message" in detail
          ? String((detail as { message?: unknown }).message)
          : `Request failed with status ${response.status}`;
      throw new ApiError(message, response.status, detail);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError("The server did not respond in time", 0, null);
    }
    throw new ApiError("Cannot reach the SpendWise server", 0, error);
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Mappers (snake_case API <-> camelCase IndexedDB)
// ---------------------------------------------------------------------------
export function fromApiTransaction(api: ApiTransaction): Omit<LocalTransaction, "syncState"> {
  return {
    id: api.id,
    title: api.title,
    amountPaise: api.amount_paise,
    type: api.type,
    category: api.category,
    date: api.date,
    paymentMethod: api.payment_method,
    notes: api.notes ?? "",
    createdAt: api.created_at,
    updatedAt: api.updated_at,
    version: api.version,
    deletedAt: api.deleted_at,
  };
}

export function toApiTransaction(tx: LocalTransaction): ApiTransaction {
  return {
    id: tx.id,
    title: tx.title,
    amount_paise: tx.amountPaise,
    type: tx.type,
    category: tx.category,
    date: tx.date,
    payment_method: tx.paymentMethod,
    notes: tx.notes || null,
    created_at: tx.createdAt,
    updated_at: tx.updatedAt,
    version: tx.version,
    deleted_at: tx.deletedAt,
  };
}

export function fromApiBudget(api: ApiBudget): Omit<LocalBudget, "syncState"> {
  return {
    id: api.id,
    category: api.category,
    monthlyLimitPaise: api.monthly_limit_paise,
    month: api.month,
    year: api.year,
    createdAt: api.created_at,
    updatedAt: api.updated_at,
    version: api.version,
    deletedAt: api.deleted_at,
  };
}

export function toApiBudget(budget: LocalBudget): ApiBudget {
  return {
    id: budget.id,
    category: budget.category,
    monthly_limit_paise: budget.monthlyLimitPaise,
    month: budget.month,
    year: budget.year,
    created_at: budget.createdAt,
    updated_at: budget.updatedAt,
    version: budget.version,
    deleted_at: budget.deletedAt,
  };
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------
export const api = {
  baseUrl: API_BASE_URL,

  health(): Promise<{ status: string; database: string }> {
    return request("/api/health");
  },

  sync(operations: ApiSyncOperation[]): Promise<ApiSyncResponse> {
    return request("/api/sync", {
      method: "POST",
      body: JSON.stringify({ operations }),
    });
  },

  changes(since?: string, limit = 1000): Promise<ApiSyncChanges> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (since) params.set("since", since);
    return request(`/api/sync/changes?${params.toString()}`);
  },

  status(): Promise<Record<string, unknown>> {
    return request("/api/sync/status");
  },
};
