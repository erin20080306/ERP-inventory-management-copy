import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/?source=pwa",
    name: "專業 ERP 進銷存會計系統",
    short_name: "ERP 系統",
    description: "整合進銷存、會計、報表的企業級管理系統",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui", "browser"],
    orientation: "any",
    background_color: "#0f172a",
    theme_color: "#4f46e5",
    lang: "zh-TW",
    dir: "ltr",
    categories: ["business", "productivity", "finance"],
    prefer_related_applications: false,
    icons: [
      // 舊 Android Chrome 偏好的小尺寸 (用 192 縮放)
      { src: "/icon-192", sizes: "48x48", type: "image/png", purpose: "any" },
      { src: "/icon-192", sizes: "72x72", type: "image/png", purpose: "any" },
      { src: "/icon-192", sizes: "96x96", type: "image/png", purpose: "any" },
      { src: "/icon-192", sizes: "144x144", type: "image/png", purpose: "any" },
      { src: "/icon-192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512", sizes: "256x256", type: "image/png", purpose: "any" },
      { src: "/icon-512", sizes: "384x384", type: "image/png", purpose: "any" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "any" },
      // maskable (Android adaptive icon)
      { src: "/icon-192", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
