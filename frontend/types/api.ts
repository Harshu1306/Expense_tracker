import type { Category, TransactionType } from "@/types";

/** API payloads use snake_case and integer paise, matching the FastAPI schema. */
export interface ApiTransaction {
  id: string;
  title: string;
  amount_paise: number;
  type: TransactionType;
  category: Category;
  date: string;
  payment_method: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  version: number;
  deleted_at: string | null;
}

export interface ApiBudget {
  id: string;
  category: "All" | Category;
  monthly_limit_paise: number;
  month: number;
  year: number;
  created_at: string;
  updated_at: string;
  version: number;
  deleted_at: string | null;
}

export interface ApiSyncOperation {
  operation_id: string;
  entity: "transaction" | "budget";
  op_type: "CREATE" | "UPDATE" | "DELETE";
  entity_id: string;
  payload: Record<string, unknown>;
  base_version: number;
  client_timestamp: string;
}

export type ApiSyncStatus =
  | "applied"
  | "duplicate"
  | "conflict"
  | "ignored"
  | "not_found"
  | "error";

export interface ApiSyncResult {
  operation_id: string;
  entity: "transaction" | "budget";
  entity_id: string;
  status: ApiSyncStatus;
  duplicate: boolean;
  server_version: number | null;
  record: Record<string, unknown> | null;
  message: string | null;
}

export interface ApiSyncResponse {
  results: ApiSyncResult[];
  server_time: string;
  applied: number;
  duplicates: number;
  conflicts: number;
  errors: number;
}

export interface ApiSyncChanges {
  server_time: string;
  transactions: ApiTransaction[];
  budgets: ApiBudget[];
  has_more: boolean;
}

export interface ApiSyncStatusOut {
  server_time: string;
  transaction_count: number;
  deleted_transaction_count: number;
  budget_count: number;
  deleted_budget_count: number;
  operations_processed: number;
  last_change_at: string | null;
}

export interface ApiSummary {
  currency: "INR";
  total_balance_paise: number;
  total_income_paise: number;
  total_expense_paise: number;
  this_month_expense_paise: number;
  this_month_income_paise: number;
  month: number;
  year: number;
  transaction_count: number;
  budget_paise: number | null;
  budget_spent_paise: number;
  budget_remaining_paise: number | null;
  budget_percent_used: number;
  budget_state: "none" | "ok" | "warning" | "exceeded";
}
