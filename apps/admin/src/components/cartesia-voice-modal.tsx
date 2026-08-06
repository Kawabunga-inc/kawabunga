"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminButton } from "@/components/admin-ui";

/**
 * Add a Cartesia voice by id.
 *
 * Cartesia has a working streaming adapter and a create endpoint that already
 * accepts `provider: "cartesia"` — the library just had no way in, so the
 * picker answered "coming soon" for a provider that works. This is that way
 * in: paste the voice id from the Cartesia dashboard and bind it.
 *
 * Deliberately manual rather than a catalog browser: we don't proxy Cartesia's
 * voice list yet, and a form that works today beats a browser that doesn't.
 */

const FONT_MONO = "var(--font-mono), ui-monospace, monospace";

type State =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "error"; message: string };

export function CartesiaVoiceModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [modelId, setModelId] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && state.kind !== "saving") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.kind, onClose]);

  const submit = useCallback(async () => {
    if (!name.trim() || !voiceId.trim()) return;
    setState({ kind: "saving" });
    try {
      const res = await fetch("/api/voices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: "cartesia",
          name: name.trim(),
          description: description.trim() || null,
          // Tags drive the tone pills on the library card.
          tags: tags
            .split(",")
            .map((t) => t.trim().toLowerCase().replace(/\s+/g, "_"))
            .filter(Boolean),
          providerConfig: {
            voiceId: voiceId.trim(),
            ...(modelId.trim() ? { modelId: modelId.trim() } : {}),
          },
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setState({
          kind: "error",
          message: body?.error ?? `Create failed (${res.status})`,
        });
        return;
      }
      onClose();
      router.refresh();
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "Network error",
      });
    }
  }, [name, voiceId, modelId, description, tags, onClose, router]);

  const canSubmit =
    name.trim().length > 0 && voiceId.trim().length > 0 && state.kind !== "saving";

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && state.kind !== "saving") onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--modal-backdrop)",
        backdropFilter: "blur(8px)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--space-24)",
      }}
    >
      <div
        style={{
          width: 520,
          maxWidth: "100%",
          background: "var(--background)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-xl)",
          overflow: "hidden",
          boxShadow: "var(--elevation-panel)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 28px",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span
              style={{
                fontFamily: FONT_MONO,
                fontSize: "var(--font-size-2xs)",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--accent-strong)",
              }}
            >
              Cartesia
            </span>
            <span
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontSize: "var(--font-size-xl)",
                fontWeight: 600,
                color: "var(--text-primary)",
              }}
            >
              Add a voice
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={state.kind === "saving"}
            aria-label="Close"
            style={{
              background: "none",
              border: "none",
              cursor: state.kind === "saving" ? "default" : "pointer",
              color: "var(--text-tertiary)",
              fontSize: 20,
              lineHeight: 1,
              padding: 4,
            }}
          >
            ×
          </button>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-16)",
            padding: 28,
          }}
        >
          <Field label="Name" hint="Shown on the library card.">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ronald"
              autoFocus
              style={inputStyle}
            />
          </Field>
          <Field
            label="Cartesia voice ID"
            hint="From the Cartesia dashboard — a UUID."
          >
            <input
              value={voiceId}
              onChange={(e) => setVoiceId(e.target.value)}
              placeholder="5ee9feff-1265-424a-9d7f-8e4d431a12c7"
              style={{ ...inputStyle, fontFamily: FONT_MONO }}
            />
          </Field>
          <Field label="Model" hint="Blank uses sonic-2.">
            <input
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              placeholder="sonic-2"
              style={{ ...inputStyle, fontFamily: FONT_MONO }}
            />
          </Field>
          <Field label="Description" hint="How the voice sounds, in a sentence.">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Gravelled elder statesman, near-instant attack."
              style={inputStyle}
            />
          </Field>
          <Field label="Tone tags" hint="Comma separated — these become the pills.">
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="gravel, authoritative, character"
              style={inputStyle}
            />
          </Field>

          {state.kind === "error" && (
            <div
              role="alert"
              style={{
                padding: "10px 12px",
                borderRadius: "var(--radius-md)",
                background: "var(--status-error-fill, rgba(255,90,90,0.10))",
                border: "1px solid var(--status-error)",
                fontFamily: "var(--font-body), system-ui, sans-serif",
                fontSize: "var(--font-size-sm)",
                color: "var(--status-error)",
              }}
            >
              {state.message}
            </div>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "var(--space-8)",
              paddingTop: "var(--space-8)",
            }}
          >
            <AdminButton
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={state.kind === "saving"}
            >
              Cancel
            </AdminButton>
            <AdminButton type="button" onClick={submit} disabled={!canSubmit}>
              {state.kind === "saving" ? "Adding…" : "Add voice"}
            </AdminButton>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  height: 38,
  width: "100%",
  padding: "0 12px",
  background: "var(--control-bg)",
  border: "1px solid var(--control-border)",
  borderRadius: "var(--radius-md)",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body), system-ui, sans-serif",
  fontSize: "var(--font-size-base)",
  outline: "none",
};

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        style={{
          fontFamily: FONT_MONO,
          fontSize: "var(--font-size-2xs)",
          fontWeight: 500,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--text-tertiary)",
        }}
      >
        {label}
      </span>
      {children}
      {hint && (
        <span
          style={{
            fontFamily: "var(--font-body), system-ui, sans-serif",
            fontSize: "var(--font-size-xs)",
            color: "var(--text-quaternary)",
          }}
        >
          {hint}
        </span>
      )}
    </label>
  );
}
