"use client";

import { useEffect, useRef, useState } from "react";
import { C, FONT_MONO } from "@/components/session-workbench-theme";

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  if (!copied) throw new Error("Clipboard copy was blocked.");
}

export function SessionIdCopyButton({
  sessionId,
  displayId,
}: {
  sessionId: string;
  displayId: string;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  const resetTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current != null) window.clearTimeout(resetTimer.current);
    },
    [],
  );

  async function copySessionId() {
    try {
      await copyText(sessionId);
      setStatus("copied");
    } catch {
      setStatus("error");
    }
    if (resetTimer.current != null) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setStatus("idle"), 1400);
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-6)" }}>
      <button
        type="button"
        onClick={() => void copySessionId()}
        aria-label={`Copy session ID ${sessionId}`}
        title={status === "copied" ? "Session ID copied" : "Copy full session ID"}
        style={{
          appearance: "none",
          border: `1px solid ${status === "copied" ? C.mintMid : C.border}`,
          borderRadius: "var(--radius-sm)",
          background: status === "copied" ? C.mintBg : "transparent",
          color: status === "error" ? C.red : C.text,
          font: "inherit",
          fontWeight: 600,
          lineHeight: 1.4,
          padding: "1px 5px",
          cursor: "copy",
        }}
      >
        {displayId}
      </button>
      {status !== "idle" ? (
        <span
          role="status"
          aria-live="polite"
          style={{
            color: status === "copied" ? C.mint : C.red,
            fontFamily: FONT_MONO,
            fontSize: "var(--font-size-xs)",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {status === "copied" ? "Copied" : "Copy failed"}
        </span>
      ) : null}
    </span>
  );
}
