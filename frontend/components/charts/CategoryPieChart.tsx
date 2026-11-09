"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { CategorySlice } from "@/services/analytics";
import { formatINR } from "@/lib/money";
import { ChartTooltip } from "@/components/charts/ChartTooltip";

export function CategoryPieChart({
  data,
  totalPaise,
}: {
  data: CategorySlice[];
  totalPaise: number;
}) {
  return (
    <div className="flex flex-col items-center gap-2 p-4 sm:flex-row sm:gap-4 sm:p-5">
      <div className="relative h-[210px] w-full max-w-[240px] shrink-0 sm:w-1/2">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="totalPaise"
              nameKey="category"
              cx="50%"
              cy="50%"
              innerRadius={62}
              outerRadius={90}
              paddingAngle={2}
              stroke="none"
            >
              {data.map((slice) => (
                <Cell key={slice.category} fill={slice.color} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
            Total
          </span>
          <span className="mt-0.5 text-base font-semibold tabular-nums text-slate-900">
            {formatINR(totalPaise)}
          </span>
        </div>
      </div>

      <ul className="max-h-[220px] w-full space-y-2 overflow-y-auto pr-1 sm:w-1/2">
        {data.map((slice) => (
          <li key={slice.category} className="flex items-center gap-2.5">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: slice.color }}
            />
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-600">
              {slice.category}
            </span>
            <span className="text-[11px] font-semibold tabular-nums text-slate-900">
              {formatINR(slice.totalPaise)}
            </span>
            <span className="w-9 text-right text-[10px] tabular-nums text-slate-400">
              {slice.percent}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
