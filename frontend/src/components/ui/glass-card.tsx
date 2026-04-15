import * as React from "react";

import { cn } from "@/lib/utils";

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  glowEffect?: boolean;
  children: React.ReactNode;
}

const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, glowEffect = true, children, ...props }, ref) => {
    return (
      <div className="relative">
        {glowEffect ? (
          <div className="absolute -inset-1 rounded-3xl bg-linear-to-r from-zinc-400/10 via-zinc-300/12 to-zinc-500/10 blur-xl opacity-80" />
        ) : null}
        <div
          ref={ref}
          className={cn(
            "relative rounded-3xl border border-white/12 bg-white/8 backdrop-blur-xl",
            "shadow-[0_18px_60px_rgba(0,0,0,0.42)]",
            "before:pointer-events-none before:absolute before:inset-0 before:rounded-3xl",
            "before:bg-linear-to-b before:from-white/10 before:to-transparent",
            "after:pointer-events-none after:absolute after:inset-px after:rounded-[calc(1.5rem-1px)]",
            "after:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
            className,
          )}
          {...props}
        >
          <div className="relative z-10">{children}</div>
        </div>
      </div>
    );
  },
);
GlassCard.displayName = "GlassCard";

const GlassCardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("flex flex-col gap-2 p-6", className)} {...props} />,
);
GlassCardHeader.displayName = "GlassCardHeader";

const GlassCardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-lg font-semibold tracking-tight text-white", className)} {...props} />
  ),
);
GlassCardTitle.displayName = "GlassCardTitle";

const GlassCardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => <p ref={ref} className={cn("text-sm text-white/60", className)} {...props} />,
);
GlassCardDescription.displayName = "GlassCardDescription";

const GlassCardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />,
);
GlassCardContent.displayName = "GlassCardContent";

const GlassCardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("flex items-center gap-3 p-6 pt-0", className)} {...props} />,
);
GlassCardFooter.displayName = "GlassCardFooter";

export { GlassCard, GlassCardContent, GlassCardDescription, GlassCardFooter, GlassCardHeader, GlassCardTitle };
