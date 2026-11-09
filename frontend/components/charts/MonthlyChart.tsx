"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MonthlyPointLocal } from "@/services/analytics";
import { CHART_COLORS } from "@/lib/categories";
import { formatCompactINR } from "@/lib/money";
import { ChartTooltip } from "@/components/charts/ChartTooltip";

export function MonthlyChart({ data }: { data: MonthlyPointLocal[] }) {
  return (
    <div className="h-[290px] w-full px-2 pb-2 pt-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis
            dataKey="shortLabel"
            axisLine={false}
            tickLine={false}
            tickMargin={10}
            interval={0}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tickFormatter={(value: number) => formatCompactINR(value)}
            width={66}
          />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ fill: "#f8fafc" }}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 12, paddingTop: 10 }}
          />
          <Bar
            dataKey="incomePaise"
            name="Income"
            fill={CHART_COLORS.income}
            radius={[6, 6, 0, 0]}
            maxBarSize={30}
          />
          <Bar
            dataKey="expensePaise"
            name="Expense"
            fill={CHART_COLORS.expense}
            radius={[6, 6, 0, 0]}
            maxBarSize={30}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
