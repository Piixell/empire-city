"use client";

import { useEffect, useState } from "react";

/** Re-renders every `interval` ms and returns the server-synced time. */
export function useNow(now: () => number, interval = 250): number {
  const [t, setT] = useState(() => now());
  useEffect(() => {
    const id = setInterval(() => setT(now()), interval);
    return () => clearInterval(id);
  }, [now, interval]);
  return t;
}
