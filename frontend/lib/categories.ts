import type { Category } from "@/types";

export interface CategoryMeta {
  name: Category;
  color: string;
  softColor: string;
  /** Icon key resolved by components/CategoryIcon.tsx */
  icon:
    | "utensils"
    | "car"
    | "shopping-bag"
    | "graduation-cap"
    | "film"
    | "heart-pulse"
    | "receipt"
    | "plane"
    | "user"
    | "ellipsis";
}

export const CATEGORY_META: Record<Category, CategoryMeta> = {
  Food: {
    name: "Food",
    color: "#f97316",
    softColor: "#ffedd5",
    icon: "utensils",
  },
  Transportation: {
    name: "Transportation",
    color: "#3b82f6",
    softColor: "#dbeafe",
    icon: "car",
  },
  Shopping: {
    name: "Shopping",
    color: "#ec4899",
    softColor: "#fce7f3",
    icon: "shopping-bag",
  },
  Education: {
    name: "Education",
    color: "#8b5cf6",
    softColor: "#ede9fe",
    icon: "graduation-cap",
  },
  Entertainment: {
    name: "Entertainment",
    color: "#f43f5e",
    softColor: "#ffe4e6",
    icon: "film",
  },
  Healthcare: {
    name: "Healthcare",
    color: "#10b981",
    softColor: "#d1fae5",
    icon: "heart-pulse",
  },
  Bills: {
    name: "Bills",
    color: "#6366f1",
    softColor: "#e0e7ff",
    icon: "receipt",
  },
  Travel: {
    name: "Travel",
    color: "#06b6d4",
    softColor: "#cffafe",
    icon: "plane",
  },
  Personal: {
    name: "Personal",
    color: "#a855f7",
    softColor: "#f3e8ff",
    icon: "user",
  },
  Others: {
    name: "Others",
    color: "#64748b",
    softColor: "#f1f5f9",
    icon: "ellipsis",
  },
};

export const PAYMENT_METHOD_LABELS = {
  Cash: "Cash",
  UPI: "UPI",
  "Credit Card": "Credit Card",
  "Debit Card": "Debit Card",
  "Net Banking": "Net Banking",
  Wallet: "Wallet",
  Other: "Other",
} as const;

export const CHART_COLORS = {
  income: "#10b981",
  expense: "#8b5cf6",
  blue: "#2563eb",
  purple: "#8b5cf6",
  green: "#10b981",
  slate: "#94a3b8",
} as const;
