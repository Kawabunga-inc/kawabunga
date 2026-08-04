"use client";

import { MeshGradient as PaperMeshGradient } from "@paper-design/shaders-react";
import { useSyncExternalStore } from "react";

const subscribeToTheme = () => () => undefined;
// CSS custom properties are unavailable during SSR, so use the canonical
// Ocean accent RGB value until the computed token is available on the client.
const getServerAccent = () => "rgb(143 209 203)";

function getAccent() {
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue("--color-accent-strong")
      .trim() || getServerAccent()
  );
}

export function MeshGradient({ className }: { className?: string }) {
  const accent = useSyncExternalStore(
    subscribeToTheme,
    getAccent,
    getServerAccent,
  );

  return (
    <PaperMeshGradient
      className={className}
      style={{ width: "100%", height: "100%" }}
      colors={[
        "#ffffff",
        "#f1f7f5",
        "#dceeea",
        accent,
        "#f8fbfa",
      ]}
      speed={0.8}
      distortion={0.4}
      swirl={0.3}
      grainMixer={0.1}
      grainOverlay={0.05}
    />
  );
}
