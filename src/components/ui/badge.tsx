import React from "react";

type BadgeProps = {
  children: React.ReactNode;
  variant?: "default" | "outline" | "success" | "info" | "warning" | "danger";
  className?: string;
};

const base =
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium select-none";

const variants: Record<NonNullable<BadgeProps["variant"]>, string> = {
  default: "bg-gray-100 text-gray-800",
  outline: "border border-gray-300 text-gray-700",
  success: "bg-success text-success-foreground",
  info: "bg-info text-info-foreground",
  warning: "bg-warning text-warning-foreground",
  danger: "bg-danger text-danger-foreground",
};

export function Badge({ children, variant = "default", className = "" }: BadgeProps) {
  return <span className={`${base} ${variants[variant]} ${className}`}>{children}</span>;
}