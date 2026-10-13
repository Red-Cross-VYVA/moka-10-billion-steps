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
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
