export const CATEGORIES = [
  "Food",
  "Transportation",
  "Shopping",
  "Education",
  "Entertainment",
  "Healthcare",
  "Bills",
  "Travel",
  "Personal",
  "Others",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const PAYMENT_METHODS = [
  "Cash",
  "UPI",
  "Credit Card",
  "Debit Card",
  "Net Banking",
  "Wallet",
  "Other",
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type TransactionType = "income" | "expense";

export type SyncState = "pending" | "synced" | "conflict" | "failed";

export interface LocalTransaction {
  id: string;
  title: string;
  amountPaise: number;
  type: TransactionType;
  category: Category;
  /** Calendar date, `YYYY-MM-DD` (no timezone). */
  date: string;
  paymentMethod: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  /** Last server version seen by this device (0 until first sync). */
  version: number;
  deletedAt: string | null;
  syncState: SyncState;
}

export interface LocalBudget {
  id: string;
  /** "All" for the overall monthly budget. */
  category: "All" | Category;
  monthlyLimitPaise: number;
  month: number;
  year: number;
  createdAt: string;
  updatedAt: string;
  version: number;
  deletedAt: string | null;
  syncState: SyncState;
}

export type SyncEntity = "transaction" | "budget";
export type SyncOpType = "CREATE" | "UPDATE" | "DELETE";

export interface SyncQueueItem {
  seq: number;
  operationId: string;
  entity: SyncEntity;
  opType: SyncOpType;
  entityId: string;
  payload: Record<string, unknown>;
  baseVersion: number;
  clientTimestamp: string;
  status: "pending" | "in_flight" | "failed";
  attempts: number;
  nextRetryAt: number;
  lastError: string | null;
  createdAt: string;
}

export interface ConflictRecord {
  id?: number;
  entity: SyncEntity;
  entityId: string;
  operationId: string;
  opType: SyncOpType;
  localPayload: Record<string, unknown>;
  serverRecord: Record<string, unknown>;
  detectedAt: string;
  resolved: 0 | 1;
  resolution?: "server-wins" | "local-reapplied" | "dismissed";
}

export interface MetaEntry {
  key: string;
  value: string;
}

export interface TransactionInput {
  title: string;
  amountPaise: number;
  type: TransactionType;
  category: Category;
  date: string;
  paymentMethod: string;
  notes: string;
}

export type SortOption = "date_desc" | "date_asc" | "amount_desc" | "amount_asc";

export interface TransactionFilters {
  q: string;
  type: "all" | TransactionType;
  category: "all" | Category;
  startDate: string;
  endDate: string;
  sort: SortOption;
}

export const EMPTY_FILTERS: TransactionFilters = {
  q: "",
  type: "all",
  category: "all",
  startDate: "",
  endDate: "",
  sort: "date_desc",
};

export type BudgetState = "none" | "ok" | "warning" | "exceeded";

export interface BudgetProgress {
  budget: LocalBudget | null;
  spentPaise: number;
  remainingPaise: number;
  percentUsed: number;
  state: BudgetState;
}
