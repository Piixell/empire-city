import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-lg border border-input bg-[#0b1222] px-3 text-sm text-foreground shadow-inner outline-none transition placeholder:text-muted-foreground/70 focus-visible:border-primary/70 focus-visible:ring-2 focus-visible:ring-primary/25 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("text-xs font-semibold uppercase tracking-wider text-muted-foreground", className)} {...props} />;
}
