import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("size-10", className)} aria-hidden>
      <defs>
        <linearGradient id="lg-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe7a8" />
          <stop offset="0.55" stopColor="#f5b83d" />
          <stop offset="1" stopColor="#b8780f" />
        </linearGradient>
        <linearGradient id="lg-sky" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1e3a8a" />
          <stop offset="1" stopColor="#0b1222" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="14" fill="url(#lg-sky)" stroke="url(#lg-gold)" strokeWidth="3" />
      <rect x="12" y="30" width="8" height="22" rx="1.5" fill="url(#lg-gold)" />
      <rect x="23" y="18" width="9" height="34" rx="1.5" fill="url(#lg-gold)" />
      <rect x="35" y="11" width="8" height="41" rx="1.5" fill="#fff4d1" />
      <rect x="46" y="24" width="7" height="28" rx="1.5" fill="url(#lg-gold)" />
      <path d="M39 6 l2 5 h-4z" fill="#fff4d1" />
      <rect x="10" y="51" width="45" height="3" rx="1.5" fill="#fff4d1" opacity="0.8" />
    </svg>
  );
}

export function Logo({ className, size = "md", compact }: { className?: string; size?: "sm" | "md" | "lg"; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark className={size === "lg" ? "size-16" : size === "sm" ? "size-8" : "size-10"} />
      <div className={cn("leading-none", compact && "hidden md:block")}>
        <div
          className={cn(
            "font-display font-extrabold tracking-tight text-gradient-gold",
            size === "lg" ? "text-5xl sm:text-6xl" : size === "sm" ? "text-lg" : "text-2xl",
          )}
        >
          EMPIRE CITY
        </div>
        {size === "lg" && <div className="mt-1 text-sm font-medium tracking-[0.3em] text-muted-foreground">COMPRA · COSTRUISCI · DOMINA</div>}
      </div>
    </div>
  );
}

/** Stylized illustrated skyline used as page background. */
export function CitySkyline({ className }: { className?: string }) {
  const back = [
    [0, 120], [40, 150], [70, 110], [105, 170], [140, 130], [180, 190], [215, 140], [250, 210], [290, 160], [330, 230],
    [370, 175], [410, 200], [450, 150], [490, 240], [530, 185], [570, 215], [610, 160], [650, 250], [690, 180],
    [730, 205], [770, 150], [810, 225], [850, 170], [890, 195], [930, 140], [970, 210], [1010, 165], [1050, 190],
    [1090, 135], [1130, 175], [1170, 120],
  ];
  const front = [
    [0, 90, 50], [55, 140, 40], [100, 110, 55], [160, 200, 45], [210, 150, 60], [275, 260, 50], [330, 170, 45],
    [380, 120, 60], [445, 310, 55], [505, 190, 45], [555, 140, 70], [630, 240, 50], [685, 180, 55], [745, 330, 48],
    [798, 160, 60], [863, 210, 45], [913, 130, 65], [983, 270, 50], [1038, 150, 55], [1098, 190, 45], [1148, 110, 52],
  ];
  return (
    <svg viewBox="0 0 1200 400" preserveAspectRatio="xMidYMax slice" className={cn("pointer-events-none", className)} aria-hidden>
      <defs>
        <linearGradient id="sky-back" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b2a52" />
          <stop offset="1" stopColor="#0c1428" />
        </linearGradient>
        <linearGradient id="sky-front" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#111c38" />
          <stop offset="1" stopColor="#070b16" />
        </linearGradient>
        <pattern id="windows" width="12" height="16" patternUnits="userSpaceOnUse">
          <rect x="3" y="4" width="4" height="6" fill="#f5b83d" opacity="0.55" />
        </pattern>
        <pattern id="windows2" width="14" height="18" patternUnits="userSpaceOnUse">
          <rect x="4" y="5" width="4" height="6" fill="#7dd3fc" opacity="0.35" />
          <rect x="9" y="11" width="3" height="5" fill="#f5b83d" opacity="0.4" />
        </pattern>
      </defs>
      <g opacity="0.9">
        {back.map(([x, h], i) => (
          <rect key={`b${i}`} x={x} y={400 - h} width="38" height={h} fill="url(#sky-back)" />
        ))}
      </g>
      <g>
        {front.map(([x, h, w], i) => (
          <g key={`f${i}`}>
            <rect x={x} y={400 - h} width={w} height={h} fill="url(#sky-front)" stroke="#1f2d52" strokeWidth="1" />
            <rect x={x + 4} y={400 - h + 10} width={w - 8} height={h - 14} fill={i % 2 ? "url(#windows)" : "url(#windows2)"} />
            {h > 250 && <rect x={x + w / 2 - 1.5} y={400 - h - 26} width="3" height="26" fill="#f5b83d" />}
          </g>
        ))}
      </g>
    </svg>
  );
}
