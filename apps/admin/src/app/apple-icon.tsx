import { ImageResponse } from "next/og";
import { KAWABUNGA_ICON_PATHS } from "@/components/kawabunga-logo-paths";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          // Static PNG render, so no var(); canonical Ocean background + mint.
          background: "#13181D",
          borderRadius: 36,
        }}
      >
        <svg width="148" height="41" viewBox="0 0 596 163" fill="none">
          {KAWABUNGA_ICON_PATHS.map((path) => (
            <path key={path} d={path} fill="rgb(143 209 203)" />
          ))}
        </svg>
      </div>
    ),
    { ...size },
  );
}
