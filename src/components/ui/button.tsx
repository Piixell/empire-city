import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-all disabled:pointer-events-none disabled:opacity-45 outline-none focus-visible:ring-2 focus-visible:ring-ring/70 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 active:translate-y-px cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-b from-[#ffd36e] to-[#e9a520] text-primary-foreground shadow-[0_6px_20px_-6px_rgba(245,184,61,0.7)] hover:brightness-110",
        secondary: "bg-secondary text-secondary-foreground border border-border hover:bg-[#25345a]",
        outline: "border border-border bg-transparent hover:bg-white/5",
        ghost: "hover:bg-white/5",
        destructive: "bg-gradient-to-b from-[#f87171] to-[#dc2626] text-white hover:brightness-110",
        success: "bg-gradient-to-b from-[#4ade80] to-[#16a34a] text-[#052e14] hover:brightness-110",
        accent: "bg-gradient-to-b from-[#7dd3fc] to-[#0ea5e9] text-accent-foreground hover:brightness-110",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 px-3 text-xs",
        lg: "h-12 px-6 text-base",
        xl: "h-14 px-8 text-lg",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { buttonVariants };
