"use client";

import { MeshGradient as PaperMeshGradient } from "@paper-design/shaders-react";

export function MeshGradient({ className }: { className?: string }) {
  return (
    <PaperMeshGradient
      className={className}
      style={{ width: "100%", height: "100%" }}
      colors={[
        "#ffffff",
        "#f1f7f5",
        "#dceeea",
        "#8fd1cb",
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
