import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";

import { cn } from "@/lib/utils";

const GlassSelect = SelectPrimitive.Root;
const GlassSelectGroup = SelectPrimitive.Group;
const GlassSelectValue = SelectPrimitive.Value;

const GlassSelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "flex h-11 w-full items-center justify-between gap-2 rounded-2xl border border-white/14 bg-white/8 px-4 py-2 text-sm text-white shadow-[0_8px_24px_rgba(0,0,0,0.22)] backdrop-blur-xl transition-all duration-300 focus:border-white/28 focus:bg-white/12 focus:outline-none focus:ring-2 focus:ring-white/12 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-4 w-4 text-white/50" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
GlassSelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const GlassSelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton ref={ref} className={cn("flex items-center justify-center py-1", className)} {...props}>
    <ChevronUp className="h-4 w-4 text-white/50" />
  </SelectPrimitive.ScrollUpButton>
));
GlassSelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

const GlassSelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton ref={ref} className={cn("flex items-center justify-center py-1", className)} {...props}>
    <ChevronDown className="h-4 w-4 text-white/50" />
  </SelectPrimitive.ScrollDownButton>
));
GlassSelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName;

const GlassSelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      position={position}
      className={cn(
        "relative z-50 max-h-96 min-w-[12rem] overflow-hidden rounded-2xl border border-white/14 bg-zinc-950/92 shadow-[0_18px_60px_rgba(0,0,0,0.42)] backdrop-blur-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className,
      )}
      {...props}
    >
      <GlassSelectScrollUpButton />
      <SelectPrimitive.Viewport className={cn("p-1", position === "popper" ? "min-w-[var(--radix-select-trigger-width)]" : "")}>
        {children}
      </SelectPrimitive.Viewport>
      <GlassSelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
GlassSelectContent.displayName = SelectPrimitive.Content.displayName;

const GlassSelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-pointer select-none items-center rounded-xl py-2 pl-8 pr-3 text-sm text-white/80 outline-none transition-colors focus:bg-white/8 focus:text-white data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className,
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-4 w-4 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4 text-white" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
GlassSelectItem.displayName = SelectPrimitive.Item.displayName;

export {
  GlassSelect,
  GlassSelectContent,
  GlassSelectGroup,
  GlassSelectItem,
  GlassSelectScrollDownButton,
  GlassSelectScrollUpButton,
  GlassSelectTrigger,
  GlassSelectValue,
};
