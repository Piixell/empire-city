import {
  Bike,
  Car,
  Cat,
  Crown,
  Dog,
  Gem,
  Plane,
  Rocket,
  Ship,
  TrainFront,
  type LucideIcon,
} from "lucide-react";
import type { PlayerColor, TokenModel } from "@/lib/game/types";

export const PLAYER_COLORS: Record<PlayerColor, { hex: string; label: string; ring: string; soft: string }> = {
  red: { hex: "#ef4444", label: "Rosso", ring: "ring-red-400", soft: "rgba(239,68,68,0.18)" },
  blue: { hex: "#3b82f6", label: "Blu", ring: "ring-blue-400", soft: "rgba(59,130,246,0.18)" },
  green: { hex: "#22c55e", label: "Verde", ring: "ring-green-400", soft: "rgba(34,197,94,0.18)" },
  yellow: { hex: "#eab308", label: "Giallo", ring: "ring-yellow-400", soft: "rgba(234,179,8,0.2)" },
  purple: { hex: "#a855f7", label: "Viola", ring: "ring-purple-400", soft: "rgba(168,85,247,0.18)" },
  orange: { hex: "#f97316", label: "Arancione", ring: "ring-orange-400", soft: "rgba(249,115,22,0.18)" },
};

export const COLOR_ORDER: PlayerColor[] = ["red", "blue", "green", "yellow", "purple", "orange"];

export const TOKEN_ICONS: Record<TokenModel, { icon: LucideIcon; label: string }> = {
  car: { icon: Car, label: "Auto sportiva" },
  ship: { icon: Ship, label: "Yacht" },
  plane: { icon: Plane, label: "Jet privato" },
  rocket: { icon: Rocket, label: "Razzo" },
  crown: { icon: Crown, label: "Corona" },
  gem: { icon: Gem, label: "Diamante" },
  dog: { icon: Dog, label: "Cane" },
  cat: { icon: Cat, label: "Gatto" },
  train: { icon: TrainFront, label: "Treno" },
  bike: { icon: Bike, label: "Bici" },
};

export const TOKEN_ORDER: TokenModel[] = ["car", "ship", "plane", "rocket", "crown", "gem", "dog", "cat", "train", "bike"];

export const AVATAR_OPTIONS = ["🙂", "😎", "🤠", "🧐", "🦊", "🐼", "🐯", "🦁", "🐸", "🐙", "👑", "🚀", "🎩", "💼", "🏙️", "🌆"];

export function cr(n: number): string {
  return `${Math.round(n).toLocaleString("it-IT")}`;
}
