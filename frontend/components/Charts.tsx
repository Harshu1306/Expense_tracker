"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui";

const chartLoading = () => <Skeleton className="mx-4 my-4 h-[250px] rounded-xl" />;

export const MonthlyChart = dynamic(
  () => import("@/components/charts/MonthlyChart").then((mod) => mod.MonthlyChart),
  { ssr: false, loading: chartLoading },
);

export const CategoryPieChart = dynamic(
  () => import("@/components/charts/CategoryPieChart").then((mod) => mod.CategoryPieChart),
  { ssr: false, loading: chartLoading },
);

export const WeeklyChart = dynamic(
  () => import("@/components/charts/WeeklyChart").then((mod) => mod.WeeklyChart),
  { ssr: false, loading: chartLoading },
);
