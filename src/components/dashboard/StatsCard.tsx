import React from "react";
import { Card } from "@/components/ui/card";

type GradientKey = "primary" | "info" | "success" | "warning" | "danger";

const gradientMap: Record<GradientKey, string> = {
  primary: "from-primary to-indigo-600",
  info: "from-info to-blue-600",
  success: "from-success to-emerald-600",
  warning: "from-warning to-amber-600",
  danger: "from-danger to-rose-600",
};

export type StatsCardProps = {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ size?: number }>;
  gradient?: GradientKey;
  trend?: { value: number; isPositive: boolean };
};

export function StatsCard({ title, value, icon: Icon, gradient = "primary", trend }: StatsCardProps) {
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <div className={`h-10 w-10 rounded-lg bg-gradient-to-br ${gradientMap[gradient]} text-white flex items-center justify-center shadow-sm`}>
          <Icon size={20} />
        </div>
        <div className="flex-1">
          <div className="text-sm text-gray-500">{title}</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
        </div>
        {trend && (
          <div className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${trend.isPositive ? "text-emerald-700 bg-emerald-50" : "text-rose-700 bg-rose-50"}`}>
            <span aria-hidden="true">{trend.isPositive ? "▲" : "▼"}</span>
            <span>{trend.value}%</span>
          </div>
        )}
      </div>
    </Card>
  );
}
