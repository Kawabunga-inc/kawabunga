import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kawabunga Admin",
    short_name: "Kawabunga",
    description: "Administration dashboard for Kawabunga simulation engine.",
    start_url: "/",
    display: "standalone",
    background_color: "#0C0E14",
    theme_color: "#0C0E14",
    icons: [
      {
        src: "/kawabunga_icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
