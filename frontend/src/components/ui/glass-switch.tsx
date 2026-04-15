import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

const GlassSwitch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      "peer inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-white/15 bg-white/10 backdrop-blur-xl transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-white/30 data-[state=checked]:bg-white/18",
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb className="block h-5 w-5 rounded-full bg-white shadow-[0_2px_10px_rgba(0,0,0,0.34)] transition-transform duration-300 data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0.5" />
  </SwitchPrimitive.Root>
));
GlassSwitch.displayName = SwitchPrimitive.Root.displayName;

export { GlassSwitch };
