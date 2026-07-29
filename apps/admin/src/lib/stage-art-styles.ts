/* ── Stage art-style presets ────────────────────────────────────────
 * The user picks a style per scene (stage.artStyle); prop assets store
 * one generated sprite rendition per style key, so a shared asset can
 * look pixel-art in one scene and painterly in another. Keys are
 * persisted in prop_assets.images and scenes.definition.stage.artStyle
 * — additions are cheap, renames need a data pass.
 *
 * `prompt` is the style clause appended to the sprite prompt sent to
 * the image model.
 */

export const STAGE_ART_STYLES: Record<string, { label: string; prompt: string }> = {
  pixel: {
    label: "Pixel",
    prompt:
      "16-bit pixel art game sprite, crisp pixels, limited warm palette, no anti-aliasing",
  },
  anime: {
    label: "Anime",
    prompt:
      "anime style game asset, clean cel shading, soft gradients, vibrant but harmonious colors",
  },
  painterly: {
    label: "Painterly",
    prompt:
      "hand-painted watercolor game asset, soft edges, textured brushwork, muted earthy palette",
  },
  lineart: {
    label: "Line art",
    prompt:
      "clean ink line-art game asset, minimal flat tinting, confident strokes, no cross-hatching",
  },
  flat: {
    label: "Flat",
    prompt:
      "flat vector game asset, simple geometric shapes, two-tone shading, modern minimal style",
  },
};

export const STAGE_ART_STYLE_KEYS = Object.keys(STAGE_ART_STYLES);

export function isStageArtStyle(key: unknown): key is string {
  return typeof key === "string" && key in STAGE_ART_STYLES;
}
