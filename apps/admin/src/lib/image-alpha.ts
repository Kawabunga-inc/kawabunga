import sharp from "sharp";

/**
 * Anything where R+G+B falls under this combined threshold (out of 765)
 * is considered "near-black" and gets alpha=0. 24 was chosen by eye to
 * cover anti-aliased edges without nibbling into legitimately dark colors.
 * Higher values strip more pixels; lower values leave jagged fringes.
 *
 * Extracted from the character-thumbnail route so generated prop sprites
 * can use the same knockout: image models that dropped native transparent
 * backgrounds (gpt-image-2) are prompted onto pure black instead, and the
 * alpha is recovered here.
 */
const NEAR_BLACK_RGB_SUM_THRESHOLD = 24;

export async function stripNearBlackBackground(input: Buffer): Promise<Buffer> {
  // ensureAlpha guarantees a 4-channel raw buffer even if the source was
  // JPEG (3-channel) — otherwise the per-pixel loop below would shift by
  // 3 and corrupt the image.
  const image = sharp(input).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });

  const pixels = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i] + pixels[i + 1] + pixels[i + 2] <= NEAR_BLACK_RGB_SUM_THRESHOLD) {
      pixels[i + 3] = 0;
    }
  }

  return sharp(pixels, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();
}
