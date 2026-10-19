import type { Metadata } from "next";
import { JetBrains_Mono, Rubik } from "next/font/google";
import "./globals.css";
import { he } from "@/lib/strings";
import { PlayerProvider } from "@/components/player/PlayerProvider";
import { GeminiSetup } from "@/components/GeminiSetup";
import { SiteFooter } from "@/components/SiteFooter";

const rubik = Rubik({ subsets: ["hebrew", "latin"] });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", weight: ["500"] });

export const metadata: Metadata = {
  title: he.app.title,
  description: he.app.description,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <head>
        {/* Apply saved theme before first paint to prevent flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(t===null&&window.matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})();`,
          }}
        />
      </head>
      <body className={`${rubik.className} ${mono.variable} min-h-screen bg-background antialiased`}>
        <PlayerProvider>
          {children}
          <SiteFooter />
        </PlayerProvider>
        <GeminiSetup />
      </body>
    </html>
  );
}
