"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useAnimationControls } from "framer-motion";
import { cn } from "@/lib/utils";

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

// Cube rotation that brings each face to the front.
const FACE_ROT: Record<number, { x: number; y: number }> = {
  1: { x: 0, y: 0 },
  2: { x: 0, y: -90 },
  3: { x: -90, y: 0 },
  4: { x: 90, y: 0 },
  5: { x: 0, y: 90 },
  6: { x: 0, y: 180 },
};

function Face({ n, transform }: { n: number; transform: string }) {
  return (
    <div className="dice-face" style={{ transform }}>
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i}>{PIPS[n].includes(i) ? <div className="dice-pip" /> : null}</div>
      ))}
    </div>
  );
}

function Die({ value, rollKey, size, delay }: { value: number; rollKey: number; size: number; delay: number }) {
  const controls = useAnimationControls();
  const spins = useRef(0);
  const first = useRef(true);
  useEffect(() => {
    const target = FACE_ROT[value] ?? FACE_ROT[1];
    if (first.current) {
      first.current = false;
      controls.set({ rotateX: target.x, rotateY: target.y, y: 0 });
      return;
    }
    spins.current += 2;
    const extra = 360 * spins.current;
    void controls.start({
      rotateX: [null, target.x + extra + 180, target.x + extra],
      rotateY: [null, target.y + extra - 270, target.y + extra],
      y: [0, -size * 0.6, 0],
      transition: { duration: 0.85, delay, ease: [0.2, 0.8, 0.3, 1] },
    });
  }, [rollKey, value, controls, size, delay]);
  const half = size / 2;
  return (
    <div className="dice-scene" style={{ width: size, height: size }}>
      <motion.div className="dice-cube" style={{ width: size, height: size }} animate={controls}>
        <Face n={1} transform={`translateZ(${half}px)`} />
        <Face n={6} transform={`rotateY(180deg) translateZ(${half}px)`} />
        <Face n={2} transform={`rotateY(90deg) translateZ(${half}px)`} />
        <Face n={5} transform={`rotateY(-90deg) translateZ(${half}px)`} />
        <Face n={3} transform={`rotateX(90deg) translateZ(${half}px)`} />
        <Face n={4} transform={`rotateX(-90deg) translateZ(${half}px)`} />
      </motion.div>
    </div>
  );
}

export function Dice({ dice, rollKey, size = 44, className }: { dice: [number, number] | null; rollKey: number; size?: number; className?: string }) {
  const [d1, d2] = dice ?? [1, 1];
  const [shadowKey, setShadowKey] = useState(rollKey);
  useEffect(() => setShadowKey(rollKey), [rollKey]);
  return (
    <div className={cn("flex items-center gap-3", !dice && "opacity-50", className)} data-roll={shadowKey}>
      <Die value={d1} rollKey={rollKey} size={size} delay={0} />
      <Die value={d2} rollKey={rollKey} size={size} delay={0.08} />
    </div>
  );
}
