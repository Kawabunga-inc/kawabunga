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

// Deliberately a small set while the look is being tuned — every style
// multiplies rendition storage and generation cost per artifact.
export const STAGE_ART_STYLES: Record<string, { label: string; prompt: string }> = {
  painterly: {
    label: "Painterly",
    // The house style. ("Minimalist spatial-editor overlays" from the
    // original art direction is intentionally omitted here: on a single
    // isolated sprite the model would paint UI chrome onto the object —
    // the canvas grid/HUD provides that layer instead.)
    prompt:
      "painterly orthographic top-down historical rendering, like a premium illustrated RPG map asset, a detailed illustrated miniature with subtle internal shading, warm natural textures, muted earth tones, soft cinematic light",
  },
  pixel: {
    label: "Pixel",
    prompt:
      "16-bit pixel art game sprite, crisp pixels, limited warm palette, no anti-aliasing",
  },
};

export const STAGE_ART_STYLE_KEYS = Object.keys(STAGE_ART_STYLES);

export function isStageArtStyle(key: unknown): key is string {
  return typeof key === "string" && key in STAGE_ART_STYLES;
}
