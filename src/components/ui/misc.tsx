"use client";

import * as React from "react";
import { Switch as SwitchPrimitive, Tooltip as T } from "radix-ui";
import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border bg-white/5 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        className,
      )}
      {...props}
    />
  );
}

export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-border bg-[#0b1222] transition data-[state=checked]:bg-primary disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-5 translate-x-0.5 rounded-full bg-white shadow transition data-[state=checked]:translate-x-[1.3rem]" />
    </SwitchPrimitive.Root>
  );
}

export const TooltipProvider = T.Provider;

/** Tooltip that also works on disabled buttons (wrapped in a span). */
export function Hint({ label, children, side = "top" }: { label?: React.ReactNode; children: React.ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  if (!label) return <>{children}</>;
  return (
    <T.Root delayDuration={150}>
      <T.Trigger asChild>
        <span className="inline-flex" tabIndex={0}>
          {children}
        </span>
      </T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={6}
          className="z-[60] max-w-64 rounded-md border border-border bg-[#0b1222] px-2.5 py-1.5 text-xs text-foreground shadow-xl"
        >
          {label}
          <T.Arrow className="fill-[#0b1222]" />
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("glass rounded-2xl", className)} {...props} />;
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn("inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent", className)} />;
}
