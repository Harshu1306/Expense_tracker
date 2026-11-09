"use client";

import { formatINR } from "@/lib/money";

/* Recharts passes loosely typed payloads; keeping this helper permissive
   avoids coupling to Recharts' internal generic types. */
export function ChartTooltip(props: {
  active?: boolean;
  payload?: Array<{
    name?: string;
    value?: number;
    dataKey?: string;
    color?: string;
    payload?: Record<string, unknown> & { fill?: string; date?: string; category?: string };
  }>;
  label?: string | number;
  labelFormatter?: (label: string | number, payload: unknown[]) => string;
}) {
  const { active, payload, label, labelFormatter } = props;
  if (!active || !payload || payload.length === 0) return null;

  const displayLabel =
    labelFormatter && label !== undefined
      ? labelFormatter(label, payload)
      : label;

  return (
    <div className="min-w-[150px] rounded-xl border border-slate-200 bg-white/95 px-3 py-2.5 shadow-lg backdrop-blur">
      {displayLabel !== undefined ? (
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {displayLabel}
        </p>
      ) : null}
      <div className="space-y-1">
        {payload.map((entry, index) => {
          const color = entry.color ?? entry.payload?.fill ?? "#94a3b8";
          return (
            <div key={`${entry.dataKey ?? entry.name}-${index}`} className="flex items-center gap-2">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="text-xs text-slate-500">{entry.name}</span>
              <span className="ml-auto text-xs font-semibold tabular-nums text-slate-900">
                {formatINR(Number(entry.value ?? 0))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
