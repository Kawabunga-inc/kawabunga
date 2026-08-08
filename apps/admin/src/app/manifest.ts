import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kawabunga Admin",
    short_name: "Kawabunga",
    description: "Administration dashboard for Kawabunga simulation engine.",
    start_url: "/",
    display: "standalone",
    // Serialized manifest values, so no var(); canonical Ocean background.
    background_color: "#13181D",
    theme_color: "#13181D",
    icons: [
      {
        src: "/kawabunga_icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
