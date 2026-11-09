"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { WeeklyPointLocal } from "@/services/analytics";
import { formatCompactINR } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { CHART_COLORS } from "@/lib/categories";
import { ChartTooltip } from "@/components/charts/ChartTooltip";

export function WeeklyChart({ data }: { data: WeeklyPointLocal[] }) {
  return (
    <div className="h-[250px] w-full px-2 pb-2 pt-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis dataKey="label" axisLine={false} tickLine={false} tickMargin={10} />
          <YAxis
            axisLine={false}
            tickLine={false}
            tickFormatter={(value: number) => formatCompactINR(value)}
            width={62}
          />
          <Tooltip
            content={
              <ChartTooltip
                labelFormatter={(_label, payload) => {
                  const point = payload?.[0] as { payload?: { date?: string } } | undefined;
                  return point?.payload?.date ? formatDate(point.payload.date) : "";
                }}
              />
            }
            cursor={{ fill: "#f8fafc" }}
          />
          <Bar
            dataKey="expensePaise"
            name="Spent"
            fill={CHART_COLORS.blue}
            radius={[6, 6, 0, 0]}
            maxBarSize={34}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
