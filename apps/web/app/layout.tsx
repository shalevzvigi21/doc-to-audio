import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Rubik } from "next/font/google";
import "./globals.css";
import { he } from "@/lib/strings";
import { PlayerProvider } from "@/components/player/PlayerProvider";
import { GeminiSetup } from "@/components/GeminiSetup";
import { OpenAISetup } from "@/components/OpenAISetup";
import { SiteFooter } from "@/components/SiteFooter";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

const rubik = Rubik({ subsets: ["hebrew", "latin"] });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", weight: ["500"] });

export const metadata: Metadata = {
  title: he.app.title,
  description: he.app.description,
  appleWebApp: { capable: true, title: he.app.title, statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  formatDetection: { telephone: false },
};

// viewport-fit=cover makes env(safe-area-inset-*) real on iPhones with a notch/home bar.
// theme-color tints the phone's browser bar to match --background (light / dark).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#edeef3" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0c12" },
  ],
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
      <body className={`${rubik.className} ${mono.variable} min-h-dvh bg-background antialiased`}>
        <PlayerProvider>
          {children}
          <SiteFooter />
        </PlayerProvider>
        <GeminiSetup />
        <OpenAISetup />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
