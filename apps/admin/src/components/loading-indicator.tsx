"use client";

import { useId, type CSSProperties } from "react";
import { KAWABUNGA_ICON_PATHS } from "@/components/kawabunga-logo-paths";

type LoadingIndicatorProps = {
  size?: number | string;
  speedSeconds?: number;
  intensity?: number;
  thickness?: number;
  pulseLength?: number;
  label?: string;
  showBase?: boolean;
  showLoaderPathOverlay?: boolean;
  className?: string;
  style?: CSSProperties;
};

const srOnly: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function LoadingIndicator({
  size = 320,
  speedSeconds = 1.35,
  intensity = 0.85,
  thickness = 1.7,
  pulseLength = 1.25,
  label = "Loading",
  showBase = true,
  showLoaderPathOverlay = false,
  className,
  style,
}: LoadingIndicatorProps) {
  const id = useId().replace(/:/g, "");
  const clipId = `kawabunga-loader-clip-${id}`;
  const gradientId = `kawabunga-loader-gradient-${id}`;
  const safeSpeed = clamp(Number.isFinite(speedSeconds) ? speedSeconds : 1.35, 0.6, 4);
  const safeIntensity = clamp(Number.isFinite(intensity) ? intensity : 0.85, 0.2, 1);
  const safeThickness = clamp(Number.isFinite(thickness) ? thickness : 1.7, 0.7, 3.5);
  const safePulseLength = clamp(Number.isFinite(pulseLength) ? pulseLength : 1.25, 0.7, 3);
  const width = typeof size === "number" ? `${size}px` : size;
  const sweepWidth = 54 * safePulseLength;
  const blur = 4 + safeThickness * 3;

  return (
    <div
      role="status"
      aria-label={label}
      className={className}
      style={{
        position: "relative",
        display: "inline-flex",
        width,
        color: "var(--accent)",
        ...style,
      }}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 596 163"
        fill="none"
        style={{
          display: "block",
          width: "100%",
          height: "auto",
          overflow: "visible",
        }}
      >
        <defs>
          <clipPath id={clipId}>
            {KAWABUNGA_ICON_PATHS.map((path) => (
              <path key={path} d={path} />
            ))}
          </clipPath>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
            <stop offset="46%" stopColor="currentColor" stopOpacity={0.25 * safeIntensity} />
            <stop offset="58%" stopColor="currentColor" stopOpacity={safeIntensity} />
            <stop offset="72%" stopColor="currentColor" stopOpacity={0.35 * safeIntensity} />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
          <filter id={`kawabunga-loader-glow-${id}`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation={blur} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {showBase
          ? KAWABUNGA_ICON_PATHS.map((path) => (
              <path
                key={path}
                d={path}
                fill="currentColor"
                opacity={0.1 + safeIntensity * 0.08}
              />
            ))
          : null}

        <g clipPath={`url(#${clipId})`}>
          <rect
            x={-sweepWidth}
            y="-24"
            width={sweepWidth}
            height="211"
            fill={`url(#${gradientId})`}
            filter={`url(#kawabunga-loader-glow-${id})`}
          >
            <animate
              attributeName="x"
              values={`${-sweepWidth};${596 + sweepWidth}`}
              dur={`${safeSpeed}s`}
              repeatCount="indefinite"
            />
          </rect>
        </g>

        {showLoaderPathOverlay
          ? KAWABUNGA_ICON_PATHS.map((path) => (
              <path
                key={path}
                d={path}
                fill="none"
                stroke="currentColor"
                strokeWidth={safeThickness}
                opacity={0.4}
              />
            ))
          : null}
      </svg>
      <span style={srOnly}>{label}</span>
    </div>
  );
}
