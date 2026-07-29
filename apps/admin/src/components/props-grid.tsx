"use client";

import { useMemo, useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import type { PropAssetSummary } from "@/app/(authenticated)/props/page";
import {
  archivePropAsset,
  createPropAsset,
  deletePropAsset,
  unarchivePropAsset,
  updatePropAssetMeta,
} from "@/app/(authenticated)/props/actions";
import { AdminButton, AdminPageShell, AdminStatusPill, adminTokens } from "@/components/admin-ui";
import { useHeaderContent } from "@/components/header-context";
import { PROP_ICON_KEYS, PROP_ICONS, PropIcon } from "@/components/scene-stage/prop-icons";
import {
  checkboxRowStyle,
  Field,
  fieldLabelStyle,
  inputStyle,
  kickerStyle,
  T,
  textareaStyle,
} from "@/components/scene-tabs/shared";
import { useEffect } from "react";

type EditableFields = {
  name: string;
  description: string;
  icon: string | null;
  shape: "round" | "rect";
  radiusM: string;
  widthM: string;
  heightM: string;
  soundSource: boolean;
  tags: string;
};

function toEditable(asset: PropAssetSummary): EditableFields {
  return {
    name: asset.name,
    description: asset.description ?? "",
    icon: asset.icon,
    shape: asset.defaultRadiusM != null ? "round" : "rect",
    radiusM: asset.defaultRadiusM != null ? String(asset.defaultRadiusM) : "",
    widthM: asset.defaultWidthM != null ? String(asset.defaultWidthM) : "",
    heightM: asset.defaultHeightM != null ? String(asset.defaultHeightM) : "",
    soundSource: asset.soundSource,
    tags: asset.tags.join(", "),
  };
}

function parseDim(value: string): number | null {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/* ── The prop-assets library page ───────────────────────────────────
 * Reusable stage set pieces. Placement lives on scene canvases; this
 * page owns the canonical visual + default footprint.
 */
export function PropsGrid({ propAssets }: { propAssets: PropAssetSummary[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showCreate, setShowCreate] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { setContent } = useHeaderContent();
  useEffect(() => {
    setContent(
      <div style={{ display: "flex", alignItems: "center", width: "100%", gap: "var(--space-12)" }}>
        <span
          style={{
            fontFamily: T.fontMono,
            fontSize: "var(--font-size-xs)",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--text-tertiary)",
          }}
        >
          props · stage set pieces
        </span>
        <div style={{ flex: 1 }} />
      </div>,
    );
    return () => setContent(null);
  }, [setContent]);

  const visible = useMemo(
    () => propAssets.filter((a) => showArchived || !a.archivedAt),
    [propAssets, showArchived],
  );
  const archivedCount = propAssets.filter((a) => a.archivedAt).length;

  return (
    <AdminPageShell>
      <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 880 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-12)" }}>
          <span style={kickerStyle}>
            {visible.length} set piece{visible.length === 1 ? "" : "s"}
          </span>
          <div style={{ flex: 1 }} />
          {archivedCount > 0 && (
            <label style={checkboxRowStyle}>
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(event) => setShowArchived(event.target.checked)}
              />
              show archived ({archivedCount})
            </label>
          )}
          <AdminButton
            type="button"
            variant={showCreate ? "secondary" : "primary"}
            onClick={() => setShowCreate((v) => !v)}
          >
            {showCreate ? "cancel" : "+ new prop"}
          </AdminButton>
        </div>

        {error && (
          <p style={{ margin: 0, color: T.danger, fontSize: "var(--font-size-sm)" }}>{error}</p>
        )}

        {showCreate && (
          <PropAssetForm
            pending={pending}
            submitLabel="Create prop"
            onSubmit={(fields) => {
              setError(null);
              start(async () => {
                const res = await createPropAsset({
                  name: fields.name,
                  description: fields.description || null,
                  icon: fields.icon,
                  shape: fields.shape,
                  radiusM: parseDim(fields.radiusM),
                  widthM: parseDim(fields.widthM),
                  heightM: parseDim(fields.heightM),
                  soundSource: fields.soundSource,
                  tags: fields.tags.split(",").map((t) => t.trim()).filter(Boolean),
                });
                if (!res.ok) setError(res.error);
                else setShowCreate(false);
                router.refresh();
              });
            }}
          />
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {visible.map((asset) => (
            <PropAssetRow
              key={asset.id}
              asset={asset}
              pending={pending}
              onError={setError}
              start={start}
              refresh={() => router.refresh()}
            />
          ))}
          {visible.length === 0 && !showCreate && (
            <p style={{ margin: 0, color: T.muted, fontSize: "var(--font-size-sm)" }}>
              No set pieces yet — create one, or accept a generated proposal from a
              scene&apos;s canvas.
            </p>
          )}
        </div>
      </div>
    </AdminPageShell>
  );
}

function PropAssetRow({
  asset,
  pending,
  onError,
  start,
  refresh,
}: {
  asset: PropAssetSummary;
  pending: boolean;
  onError: (message: string | null) => void;
  start: (fn: () => Promise<void>) => void;
  refresh: () => void;
}) {
  const [editing, setEditing] = useState(false);

  const dims =
    asset.defaultRadiusM != null
      ? `⌀ ${asset.defaultRadiusM * 2} m`
      : asset.defaultWidthM != null || asset.defaultHeightM != null
        ? `${asset.defaultWidthM ?? "?"} × ${asset.defaultHeightM ?? "?"} m`
        : "no footprint";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-lg)",
        background: T.panel,
        opacity: asset.archivedAt ? 0.6 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-12)", padding: "12px 16px" }}>
        <span
          aria-hidden
          style={{
            width: 40,
            height: 40,
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--ink-line)",
            background: "var(--ink-soft)",
            color: T.muted,
          }}
        >
          <PropIcon icon={asset.icon} size={22} />
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-8)" }}>
            <strong style={{ fontFamily: T.fontHeading, fontSize: "var(--font-size-base)", color: T.fg }}>
              {asset.name}
            </strong>
            <AdminStatusPill tone={asset.source === "generated" ? "processing" : "muted"}>
              {asset.source}
            </AdminStatusPill>
            {asset.soundSource && <AdminStatusPill tone="accent">sound source</AdminStatusPill>}
            {asset.archivedAt && <AdminStatusPill tone="danger">archived</AdminStatusPill>}
          </div>
          <span
            style={{
              fontFamily: T.fontMono,
              fontSize: "var(--font-size-2xs)",
              letterSpacing: "0.08em",
              color: T.muted,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {asset.slug} · {dims}
            {asset.tags.length > 0 ? ` · ${asset.tags.join(", ")}` : ""}
          </span>
        </div>
        <AdminButton type="button" variant="ghost" onClick={() => setEditing((v) => !v)}>
          {editing ? "close" : "edit"}
        </AdminButton>
        {asset.archivedAt ? (
          <AdminButton
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => {
              onError(null);
              start(async () => {
                const res = await unarchivePropAsset(asset.id);
                if (!res.ok) onError(res.error);
                refresh();
              });
            }}
          >
            unarchive
          </AdminButton>
        ) : (
          <AdminButton
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => {
              onError(null);
              start(async () => {
                const res = await archivePropAsset(asset.id);
                if (!res.ok) onError(res.error);
                refresh();
              });
            }}
          >
            archive
          </AdminButton>
        )}
        <AdminButton
          type="button"
          variant="danger"
          disabled={pending}
          onClick={() => {
            if (!confirm(`Delete "${asset.name}" permanently? Scene placements referencing it will break.`)) {
              return;
            }
            onError(null);
            start(async () => {
              const res = await deletePropAsset(asset.id);
              if (!res.ok) onError(res.error);
              refresh();
            });
          }}
        >
          delete
        </AdminButton>
      </div>

      {asset.description && !editing && (
        <p
          style={{
            margin: 0,
            padding: "0 16px 12px 68px",
            color: T.muted,
            fontSize: "var(--font-size-sm)",
            lineHeight: "19px",
          }}
        >
          {asset.description}
        </p>
      )}

      {editing && (
        <div style={{ padding: "0 16px 16px", borderTop: "1px solid var(--ink-fill)" }}>
          <PropAssetForm
            pending={pending}
            initial={toEditable(asset)}
            submitLabel="Save changes"
            onSubmit={(fields) => {
              onError(null);
              start(async () => {
                const res = await updatePropAssetMeta(asset.id, {
                  name: fields.name,
                  description: fields.description || null,
                  icon: fields.icon,
                  shape: fields.shape,
                  radiusM: parseDim(fields.radiusM),
                  widthM: parseDim(fields.widthM),
                  heightM: parseDim(fields.heightM),
                  soundSource: fields.soundSource,
                  tags: fields.tags.split(",").map((t) => t.trim()).filter(Boolean),
                });
                if (!res.ok) onError(res.error);
                else setEditing(false);
                refresh();
              });
            }}
          />
        </div>
      )}
    </div>
  );
}

function PropAssetForm({
  initial,
  pending,
  submitLabel,
  onSubmit,
}: {
  initial?: EditableFields;
  pending: boolean;
  submitLabel: string;
  onSubmit: (fields: EditableFields) => void;
}) {
  const [fields, setFields] = useState<EditableFields>(
    initial ?? {
      name: "",
      description: "",
      icon: null,
      shape: "rect",
      radiusM: "",
      widthM: "2",
      heightM: "1",
      soundSource: false,
      tags: "",
    },
  );
  const set = <K extends keyof EditableFields>(key: K, value: EditableFields[K]) =>
    setFields((prev) => ({ ...prev, [key]: value }));

  return (
    <div style={formStyle}>
      <Field label="Name">
        <input
          value={fields.name}
          onChange={(event) => set("name", event.target.value)}
          placeholder="Goat-hair tent"
          style={inputStyle}
        />
      </Field>
      <Field label="Description (what set-generation reads)">
        <textarea
          value={fields.description}
          onChange={(event) => set("description", event.target.value)}
          rows={2}
          placeholder="A low woven-hair family tent with an open flap."
          style={textareaStyle}
        />
      </Field>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>
        <span style={fieldLabelStyle}>Icon</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 44px)", gap: 4 }}>
          {PROP_ICON_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              title={PROP_ICONS[key].label}
              onClick={() => set("icon", key)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                height: 38,
                borderRadius: "var(--radius-md)",
                border:
                  fields.icon === key
                    ? "1.5px solid var(--accent-strong)"
                    : "1px solid var(--ink-line)",
                background: fields.icon === key ? T.accentSoft : "transparent",
                color: fields.icon === key ? T.fg : T.muted,
                cursor: "pointer",
              }}
            >
              <PropIcon icon={key} size={19} />
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: "var(--space-8)", alignItems: "flex-end" }}>
        <Field label="Footprint">
          <select
            value={fields.shape}
            onChange={(event) => set("shape", event.target.value as "round" | "rect")}
            style={{ ...inputStyle, cursor: "pointer", width: 140 }}
          >
            <option value="rect">rectangular</option>
            <option value="round">round</option>
          </select>
        </Field>
        {fields.shape === "round" ? (
          <Field label="Radius (m)">
            <input
              value={fields.radiusM}
              onChange={(event) => set("radiusM", event.target.value)}
              inputMode="decimal"
              placeholder="0.75"
              style={{ ...inputStyle, width: 110 }}
            />
          </Field>
        ) : (
          <>
            <Field label="Width (m)">
              <input
                value={fields.widthM}
                onChange={(event) => set("widthM", event.target.value)}
                inputMode="decimal"
                style={{ ...inputStyle, width: 110 }}
              />
            </Field>
            <Field label="Height (m)">
              <input
                value={fields.heightM}
                onChange={(event) => set("heightM", event.target.value)}
                inputMode="decimal"
                style={{ ...inputStyle, width: 110 }}
              />
            </Field>
          </>
        )}
      </div>
      <Field label="Tags (comma-separated)">
        <input
          value={fields.tags}
          onChange={(event) => set("tags", event.target.value)}
          placeholder="pastoral, shelter"
          style={inputStyle}
        />
      </Field>
      <label style={checkboxRowStyle}>
        <input
          type="checkbox"
          checked={fields.soundSource}
          onChange={(event) => set("soundSource", event.target.checked)}
        />
        Sound source (fire, water — future positional-audio hint)
      </label>
      <div>
        <AdminButton
          type="button"
          variant="primary"
          disabled={pending || !fields.name.trim()}
          onClick={() => onSubmit(fields)}
        >
          {submitLabel}
        </AdminButton>
      </div>
    </div>
  );
}

const formStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-12)",
  padding: "16px",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-lg)",
  background: "color-mix(in srgb, var(--text-primary) 3%, transparent)",
  fontFamily: adminTokens.fontBody,
  color: T.fg,
};
