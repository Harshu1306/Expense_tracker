import type { LucideIcon } from "lucide-react";
import {
  Car,
  Ellipsis,
  Film,
  GraduationCap,
  HeartPulse,
  Plane,
  ReceiptText,
  ShoppingBag,
  User,
  Utensils,
} from "lucide-react";
import { CATEGORY_META, type CategoryMeta } from "@/lib/categories";
import type { Category } from "@/types";
import { cn } from "@/lib/utils";

const ICONS: Record<CategoryMeta["icon"], LucideIcon> = {
  utensils: Utensils,
  car: Car,
  "shopping-bag": ShoppingBag,
  "graduation-cap": GraduationCap,
  film: Film,
  "heart-pulse": HeartPulse,
  receipt: ReceiptText,
  plane: Plane,
  user: User,
  ellipsis: Ellipsis,
};

export function CategoryIcon({
  category,
  size = "md",
  className,
}: {
  category: Category;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const meta = CATEGORY_META[category];
  const Icon = ICONS[meta.icon];
  const box =
    size === "sm" ? "h-7 w-7 rounded-lg" : size === "lg" ? "h-11 w-11 rounded-xl" : "h-9 w-9 rounded-xl";
  const icon = size === "sm" ? "h-3.5 w-3.5" : size === "lg" ? "h-5 w-5" : "h-4 w-4";

  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center", box, className)}
      style={{ backgroundColor: meta.softColor, color: meta.color }}
      aria-hidden
    >
      <Icon className={icon} strokeWidth={2} />
    </span>
  );
}
