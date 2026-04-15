import type * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const glassBadgeVariants = cva("inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium backdrop-blur-xl", {
  variants: {
    variant: {
      default: "border-white/15 bg-white/10 text-white/88",
      success: "border-emerald-400/20 bg-emerald-500/12 text-emerald-100",
      warning: "border-amber-400/20 bg-amber-500/12 text-amber-100",
      destructive: "border-red-400/20 bg-red-500/12 text-red-100",
      outline: "border-white/15 bg-transparent text-white/68",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export interface GlassBadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof glassBadgeVariants> {}

function GlassBadge({ className, variant, ...props }: GlassBadgeProps) {
  return <div className={cn(glassBadgeVariants({ variant }), className)} {...props} />;
}

export { GlassBadge };
