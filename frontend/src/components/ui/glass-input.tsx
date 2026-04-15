import * as React from "react";

import { cn } from "@/lib/utils";

export interface GlassInputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const GlassInput = React.forwardRef<HTMLInputElement, GlassInputProps>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      ref={ref}
      className={cn(
        "flex h-11 w-full rounded-2xl border border-white/14 bg-white/8 px-4 py-2 text-sm text-white shadow-[0_8px_24px_rgba(0,0,0,0.22)] backdrop-blur-xl transition-all duration-300 placeholder:text-white/35 focus:border-white/28 focus:bg-white/12 focus:outline-none focus:ring-2 focus:ring-white/12 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});
GlassInput.displayName = "GlassInput";

export { GlassInput };
