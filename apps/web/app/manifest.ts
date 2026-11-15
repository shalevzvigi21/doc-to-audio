import type { MetadataRoute } from "next";
import { he } from "@/lib/strings";

/** Web app manifest: makes the site installable (Android Chrome, iOS "Add to Home Screen"). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: he.app.title,
    short_name: he.app.title,
    description: he.app.description,
    lang: "he",
    dir: "rtl",
    start_url: "/library",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0c0c12",
    theme_color: "#0c0c12",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
