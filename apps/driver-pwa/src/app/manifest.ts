import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "10 Billion Steps Driver",
    short_name: "10B Driver",
    description:
      "Field evidence capture for the DMC Sites Activation demonstration",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f5f7",
    theme_color: "#103f63",
    orientation: "portrait",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
