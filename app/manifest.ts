import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Circle Calendar",
    short_name: "Circle",
    description: "Plan. Share. Remember.",
    start_url: "/",
    display: "standalone",
    background_color: "#040914",
    theme_color: "#040914",
    orientation: "portrait-primary",
    categories: ["productivity", "social", "lifestyle"],
    icons: [
      {
        src: "/brand/icon-192.svg",
        sizes: "192x192",
        type: "image/svg+xml",
        purpose: "maskable",
      },
      {
        src: "/brand/icon-512.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
