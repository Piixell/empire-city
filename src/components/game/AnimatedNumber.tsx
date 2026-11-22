"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Counts toward the new value and flashes green/red on change. */
export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const [shown, setShown] = useState(value);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    if (from === value) return;
    setFlash(value > from ? "up" : "down");
    const start = performance.now();
    const dur = 600;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      setShown(Math.round(from + (value - from) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    const to = setTimeout(() => setFlash(null), 900);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(to);
    };
  }, [value]);
  return (
    <span className={cn("transition-colors", flash === "up" && "text-green-400", flash === "down" && "text-red-400", className)}>
      {shown.toLocaleString("it-IT")}
    </span>
  );
}
