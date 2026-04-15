import * as React from "react";

import { cn } from "@/lib/utils";

export interface GlassTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

const GlassTextarea = React.forwardRef<HTMLTextAreaElement, GlassTextareaProps>(
  ({ className, label, error, id, ...props }, ref) => {
    const textareaId = id ?? "glass-textarea";
    const errorId = `${textareaId}-error`;

    return (
      <div className="w-full">
        {label ? <label htmlFor={textareaId} className="mb-2 block text-sm font-medium text-white/78">{label}</label> : null}
        <textarea
          id={textareaId}
          ref={ref}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? errorId : undefined}
          className={cn(
            "min-h-[120px] w-full rounded-2xl border border-white/14 bg-white/8 px-4 py-3 text-sm text-white shadow-[0_8px_24px_rgba(0,0,0,0.22)] backdrop-blur-xl transition-all duration-300 placeholder:text-white/35 focus:border-white/28 focus:bg-white/12 focus:outline-none focus:ring-2 focus:ring-white/12 disabled:cursor-not-allowed disabled:opacity-50",
            error ? "border-red-400/25 focus:border-red-400/30" : "",
            className,
          )}
          {...props}
        />
        {error ? (
          <p id={errorId} className="mt-2 text-sm text-red-300" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  },
);
GlassTextarea.displayName = "GlassTextarea";

export { GlassTextarea };
