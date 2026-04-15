import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const glassButtonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-medium transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border border-white/15 bg-white/10 text-white shadow-[0_8px_24px_rgba(0,0,0,0.25)] hover:bg-white/14",
        primary:
          "border border-white/20 bg-linear-to-r from-zinc-200/18 via-zinc-100/22 to-zinc-300/18 text-white shadow-[0_10px_28px_rgba(0,0,0,0.35)] hover:from-zinc-200/24 hover:via-zinc-100/26 hover:to-zinc-300/24",
        outline: "border border-white/20 bg-transparent text-white/80 hover:bg-white/8 hover:text-white",
        ghost: "border border-transparent bg-transparent text-white/60 hover:bg-white/8 hover:text-white",
        destructive: "border border-red-400/25 bg-red-500/12 text-red-100 hover:bg-red-500/18",
      },
      size: {
        default: "h-11 px-4 py-2",
        sm: "h-9 px-3 text-xs",
        lg: "h-12 px-5 text-base",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface GlassButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof glassButtonVariants> {
  asChild?: boolean;
}

const GlassButton = React.forwardRef<HTMLButtonElement, GlassButtonProps>(
  ({ className, variant, size, asChild = false, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    if (asChild) {
      return <Comp ref={ref} className={cn(glassButtonVariants({ variant, size }), className)} {...props}>{children}</Comp>;
    }

    return (
      <Comp ref={ref} className={cn(glassButtonVariants({ variant, size }), className)} {...props}>
        <span className="relative z-10 flex items-center gap-2">{children}</span>
      </Comp>
    );
  },
);
GlassButton.displayName = "GlassButton";

export { GlassButton, glassButtonVariants };
