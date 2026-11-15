import type { ReactNode } from "react";

type SkeletonVariant = "card" | "table-row" | "stat-tile";

interface SkeletonProps {
  className?: string;
  variant?: SkeletonVariant;
  children?: ReactNode;
}

/** Shimmering placeholder shown while content loads. Never causes layout shift:
   match the final content's approximate height via the variant prop. */
export default function Skeleton({ className, variant = "card", children }: SkeletonProps) {
  const height = variant === "table-row" ? "48px" : variant === "stat-tile" ? "80px" : "120px";
  return (
    <div className={`skeleton skeleton-${variant} ${className ?? ""}`} style={{ height }}>
      {children}
    </div>
  );
}
