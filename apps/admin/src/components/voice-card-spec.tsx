"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  costTierFor,
  formatCreditRate,
  formatFirstAudio,
  formatModelLabel,
  speedTierFor,
  voiceCapability,
  type VoiceCapability,
} from "@kawabunga/engine";

const FONT_MONO = "var(--font-mono), ui-monospace, monospace";

/* ── Rating pips ───────────────────────────────────────────────
 * Cost reads as $-pips, speed as lightning bolts, both out of 4 and both
 * derived from the provider (see @kawabunga/engine/voice-capabilities).
 * Unknown tiers render an em dash rather than an empty row, so "we don't
 * price this provider yet" never looks like "this provider is free". */

export function CostPips({ tier }: { tier: 1 | 2 | 3 | 4 | null }) {
  if (tier == null) return <Unknown />;
  return (
    <span style={{ display: "inline-flex", gap: 1 }} aria-label={`cost ${tier} of 4`}>
      <span
        style={{
          fontFamily: FONT_MONO,
          fontSize: "var(--font-size-sm)",
          fontWeight: 600,
          letterSpacing: "0.08em",
          color: "var(--accent-strong)",
        }}
      >
        {"$".repeat(tier)}
      </span>
      {tier < 4 && (
        <span
          style={{
            fontFamily: FONT_MONO,
            fontSize: "var(--font-size-sm)",
            fontWeight: 600,
            letterSpacing: "0.08em",
            color: "var(--text-quaternary)",
          }}
        >
          {"$".repeat(4 - tier)}
        </span>
      )}
    </span>
  );
}

function Bolt({ filled }: { filled: boolean }) {
  return (
    <svg width="10" height="13" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M13 2L4.5 13.5H11L9.5 22L18.5 10.5H12L13 2Z"
        fill={filled ? "var(--accent-strong)" : "var(--text-quaternary)"}
      />
    </svg>
  );
}

export function SpeedBolts({ tier }: { tier: 1 | 2 | 3 | 4 | null }) {
  if (tier == null) return <Unknown />;
  return (
    <span
      style={{ display: "inline-flex", gap: 2 }}
      aria-label={`speed ${tier} of 4`}
    >
      {[1, 2, 3, 4].map((i) => (
        <Bolt key={i} filled={i <= tier} />
      ))}
    </span>
  );
}

function Unknown() {
  return (
    <span
      style={{
        fontFamily: FONT_MONO,
        fontSize: "var(--font-size-sm)",
        color: "var(--text-quaternary)",
      }}
    >
      —
    </span>
  );
}

/* ── Spec rows ─────────────────────────────────────────────────
 * Label left, rating + exact value right. The value sits in a fixed-width
 * slot so the ratings share a vertical lane down the card. */

export function SpecRow({
  label,
  rating,
  value,
  title,
  provenance,
}: {
  label: string;
  rating: React.ReactNode;
  value: string;
  title?: string;
  provenance?: string;
}) {
  return (
    <div
      title={title}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--space-8)",
      }}
    >
      <span
        style={{
          fontFamily: FONT_MONO,
          fontSize: "var(--font-size-2xs)",
          fontWeight: 500,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--text-tertiary)",
        }}
      >
        {label}
        {provenance && (
          <span
            style={{
              marginLeft: "var(--space-6)",
              padding: "1px 5px",
              borderRadius: "var(--radius-sm)",
              background: "var(--text-tertiary)",
              color: "var(--background)",
              fontSize: "var(--font-size-3xs)",
              letterSpacing: "0.08em",
            }}
          >
            {provenance}
          </span>
        )}
      </span>
      <span
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: "var(--space-8)",
          minWidth: 0,
        }}
      >
        {rating}
        <span
          style={{
            fontFamily: FONT_MONO,
            fontSize: "var(--font-size-2xs)",
            color: "var(--text-tertiary)",
            width: 78,
            textAlign: "right",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {value}
        </span>
      </span>
    </div>
  );
}

/** Cost / Speed / Provider — the three lines that let one card be compared
 *  against its neighbours at a glance. */
export function SpecStrip({
  provider,
  modelId,
  capability,
}: {
  provider: string;
  modelId: string | null;
  capability?: VoiceCapability;
}) {
  const cap = capability ?? voiceCapability(provider, modelId);
  const shownModel = formatModelLabel(modelId ?? cap.defaultModelId);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-8)",
        paddingTop: "var(--space-12)",
        borderTop: "1px solid var(--ink-soft)",
      }}
    >
      <SpecRow
        label="Cost"
        rating={<CostPips tier={costTierFor(cap.creditsPerThousandChars)} />}
        value={formatCreditRate(cap.creditsPerThousandChars)}
        title={cap.note}
      />
      <SpecRow
        label="Speed"
        rating={<SpeedBolts tier={speedTierFor(cap.typicalFirstAudioMs)} />}
        value={formatFirstAudio(cap.typicalFirstAudioMs)}
      />
      <SpecRow
        label="Provider"
        rating={
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "2px 8px",
              borderRadius: "var(--radius-sm)",
              background: "var(--control-bg)",
              border: "1px solid var(--ink-line)",
              fontFamily: FONT_MONO,
              fontSize: "var(--font-size-2xs)",
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--text-secondary)",
              whiteSpace: "nowrap",
            }}
          >
            {cap.label}
          </span>
        }
        value={shownModel}
      />
    </div>
  );
}

/* ── Tone pills ────────────────────────────────────────────────── */

/** The voice's own tags. Capped so a heavily-tagged voice can't push the
 *  spec strip out of the card; the rest live on the detail page. */
export function TonePills({ tags, max = 3 }: { tags: string[]; max?: number }) {
  const shown = tags.slice(0, max);
  if (shown.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-6)" }}>
      {shown.map((tag) => (
        <span
          key={tag}
          style={{
            padding: "4px 9px",
            borderRadius: "var(--radius-pill)",
            background: "var(--control-bg)",
            fontFamily: FONT_MONO,
            fontSize: "var(--font-size-2xs)",
            fontWeight: 500,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--text-tertiary)",
            whiteSpace: "nowrap",
          }}
        >
          {tag.replace(/_/g, " ")}
        </span>
      ))}
      {tags.length > max && (
        <span
          style={{
            padding: "4px 9px",
            fontFamily: FONT_MONO,
            fontSize: "var(--font-size-2xs)",
            color: "var(--text-quaternary)",
          }}
        >
          +{tags.length - max}
        </span>
      )}
    </div>
  );
}

/* ── Play ──────────────────────────────────────────────────────── */

/**
 * Preview button. Streams /api/voices/:id/sample, which serves the uploaded
 * source clip or the synthesized preview — the audio we already store and,
 * until now, never gave the library a way to hear.
 *
 * Only one clip plays at a time across the grid: starting one pauses any
 * other, so clicking down a column doesn't build a chorus.
 */
/** Broadcast so every other preview button pauses itself — one clip at a
 *  time, without a shared mutable registry. */
const PREVIEW_EVENT = "kawabunga:voice-preview";

export function PlayButton({
  voiceId,
  voiceName,
  disabled,
  size = 44,
}: {
  voiceId: string;
  voiceName: string;
  disabled?: boolean;
  size?: number;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    // Another card started: yield the floor.
    const onOtherPreview = (event: Event) => {
      const startedId = (event as CustomEvent<{ voiceId: string }>).detail?.voiceId;
      if (startedId === voiceId) return;
      audioRef.current?.pause();
    };
    window.addEventListener(PREVIEW_EVENT, onOtherPreview);
    return () => {
      window.removeEventListener(PREVIEW_EVENT, onOtherPreview);
      // Leaving the page mid-clip shouldn't leave audio running.
      audioRef.current?.pause();
    };
  }, [voiceId]);

  const toggle = useCallback(
    (event: React.MouseEvent) => {
      // The whole card is a link; previewing must not navigate.
      event.stopPropagation();
      event.preventDefault();
      if (disabled) return;

      const current = audioRef.current;
      if (current && !current.paused) {
        current.pause();
        return;
      }

      // A fresh element per play: it starts at 0 without mutating a ref-held
      // one, which the compiler treats as immutable.
      const audio = new Audio(`/api/voices/${voiceId}/sample`);
      const stop = () => setPlaying(false);
      audio.addEventListener("ended", stop);
      audio.addEventListener("error", stop);
      audio.addEventListener("pause", stop);
      audioRef.current = audio;

      window.dispatchEvent(
        new CustomEvent(PREVIEW_EVENT, { detail: { voiceId } }),
      );
      void audio
        .play()
        .then(() => setPlaying(true))
        .catch(() => setPlaying(false));
    },
    [disabled, voiceId],
  );

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      aria-label={playing ? `Pause ${voiceName}` : `Play ${voiceName}`}
      title={disabled ? "No sample for this voice yet" : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: "var(--radius-pill)",
        background: disabled ? "var(--control-bg)" : "var(--accent-fill)",
        border: `1px solid ${disabled ? "var(--ink-line)" : "var(--accent-border)"}`,
        cursor: disabled ? "default" : "pointer",
        padding: 0,
        transition: "background 120ms ease, border-color 120ms ease",
      }}
    >
      {playing ? (
        <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="6" y="5" width="4" height="14" rx="1" fill="var(--accent-strong)" />
          <rect x="14" y="5" width="4" height="14" rx="1" fill="var(--accent-strong)" />
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M8 5v14l11-7z"
            fill={disabled ? "var(--text-quaternary)" : "var(--accent-strong)"}
          />
        </svg>
      )}
    </button>
  );
}
