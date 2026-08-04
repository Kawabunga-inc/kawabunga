import { ImageResponse } from "next/og";
import { KAWABUNGA_ICON_PATHS } from "@/components/kawabunga-logo-paths";

export const alt = "Kawabunga Admin";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          // Static PNG render, so no var(); canonical Ocean background + mint.
          background: "#13181D",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <svg width="360" height="270" viewBox="0 -105.402 315.009 236.299" fill="none">
          {KAWABUNGA_ICON_PATHS.map((path) => (
            <path key={path} d={path} fill="rgb(143 209 203)" />
          ))}
        </svg>

        <div
          style={{
            marginTop: 40,
            fontSize: 48,
            fontWeight: 700,
            color: "#ffffff",
            letterSpacing: "-0.02em",
          }}
        >
          Kawabunga
        </div>
        <div
          style={{
            marginTop: 8,
            fontSize: 24,
            color: "rgba(255, 255, 255, 0.5)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Admin Dashboard
        </div>
      </div>
    ),
    { ...size },
  );
}
