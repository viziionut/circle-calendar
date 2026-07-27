import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Circle Calendar",
    short_name: "Circle",
    description: "Plan together. Remember forever.",
    start_url: "/",
    display: "standalone",
    background_color: "#040914",
    theme_color: "#040914",
    orientation: "portrait-primary",
    categories: ["productivity", "social", "lifestyle"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
