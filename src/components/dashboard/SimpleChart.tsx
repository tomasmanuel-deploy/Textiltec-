import React from "react";
import { Card } from "@/components/ui/card";

export type Series = { name: string; color: string; values: number[] };

export function SimpleChart({ labels, series, height = 160 }: { labels: string[]; series: Series[]; height?: number }) {
  const max = Math.max(
    1,
    ...series.flatMap((s) => s.values)
  );
  const months = labels.length;
  return (
    <Card className="p-4">
      <div className="flex items-end gap-2" style={{ height }}>
        {Array.from({ length: months }).map((_, i) => (
          <div key={i} className="flex-1">
            <div className="flex items-end gap-1 h-full">
              {series.map((s) => {
                const v = s.values[i] ?? 0;
                const h = (v / max) * 100;
                return (
                  <div key={s.name + i} className="flex-1">
                    <div className="w-full rounded-sm" style={{ height: `${h}%`, backgroundColor: s.color }} />
                  </div>
                );
              })}
            </div>
            <div className="mt-2 text-center text-[11px] leading-tight text-gray-500 px-1 whitespace-nowrap truncate" title={labels[i]}>{labels[i]}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}