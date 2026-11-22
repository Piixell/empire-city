import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const body = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", display: "swap", weight: ["600", "700", "800"] });

export const metadata: Metadata = {
  title: "Empire City — Gioco da tavolo multiplayer",
  description: "Compra, costruisci e tratta nella città più ambiziosa. Fino a 6 giocatori online, in tempo reale.",
  applicationName: "Empire City",
};

export const viewport: Viewport = {
  themeColor: "#070b16",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className={`dark ${body.variable} ${display.variable}`}>
      <body className="bg-game antialiased">
        {children}
        <Toaster
          theme="dark"
          position="top-center"
          richColors
          closeButton
          toastOptions={{ classNames: { toast: "!bg-[#111a2e] !border-[#2a3a62]" } }}
        />
      </body>
    </html>
  );
}
