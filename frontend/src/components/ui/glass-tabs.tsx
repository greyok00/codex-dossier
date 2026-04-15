import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { AnimatePresence, motion } from "framer-motion";

import { cn } from "@/lib/utils";

const GlassTabs = TabsPrimitive.Root;

const GlassTabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-12 items-center justify-center gap-1 rounded-2xl border border-white/14 bg-white/8 p-1 shadow-[0_8px_24px_rgba(0,0,0,0.22)] backdrop-blur-xl",
      className,
    )}
    {...props}
  />
));
GlassTabsList.displayName = TabsPrimitive.List.displayName;

const GlassTabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium text-white/55 transition-all duration-200 outline-none hover:text-white/80 data-[state=active]:bg-white/14 data-[state=active]:text-white data-[state=active]:shadow-[0_8px_20px_rgba(0,0,0,0.18)]",
      className,
    )}
    {...props}
  />
));
GlassTabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const GlassTabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <TabsPrimitive.Content ref={ref} className={cn("mt-4 outline-none", className)} {...props}>
    <AnimatePresence mode="wait">
      <motion.div
        key={props.value}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.18 }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  </TabsPrimitive.Content>
));
GlassTabsContent.displayName = TabsPrimitive.Content.displayName;

export { GlassTabs, GlassTabsContent, GlassTabsList, GlassTabsTrigger };
