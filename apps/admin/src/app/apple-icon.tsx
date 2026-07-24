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
          background: "#0C0E14",
          borderRadius: 36,
        }}
      >
        <svg width="144" height="108" viewBox="0 -105.402 315.009 236.299" fill="none">
          {KAWABUNGA_ICON_PATHS.map((path) => (
            <path key={path} d={path} fill="#8fd1cb" />
          ))}
        </svg>
      </div>
    ),
    { ...size },
  );
}
