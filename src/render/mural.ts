export const MURAL_VARIANTS = 8192;
export type MuralCanvas = {
  width: number;
  height: number;
  getContext(type: "2d"): CanvasRenderingContext2D | null;
};
export function muralRecipe(value: number) {
  let n = Math.max(0, Math.min(MURAL_VARIANTS - 1, Math.floor(value)));
  const base = n % 4;
  n = Math.floor(n / 4);
  const crop = n % 16;
  n = Math.floor(n / 16);
  const zoom = n % 8;
  n = Math.floor(n / 8);
  const mirror = !!(n % 2);
  n = Math.floor(n / 2);
  return { base, crop, zoom: 1.04 + zoom * 0.04, mirror, tint: n % 8 };
}
export function composeMural(
  image: CanvasImageSource,
  variant: number,
  factory: (w: number, h: number) => MuralCanvas,
): CanvasImageSource {
  const recipe = muralRecipe(variant),
    canvas = factory(768, 256);
  canvas.width = 768;
  canvas.height = 256;
  const c = canvas.getContext("2d");
  if (!c) throw new Error("Mural canvas unavailable");
  const sw = 768 / recipe.zoom,
    sh = 256 / recipe.zoom;
  c.save();
  if (recipe.mirror) {
    c.translate(768, 0);
    c.scale(-1, 1);
  }
  c.drawImage(
    image,
    ((768 - sw) * recipe.crop) / 15,
    (256 - sh) / 2,
    sw,
    sh,
    0,
    0,
    768,
    256,
  );
  c.restore();
  // Restrained translucent washes keep artwork quieter than actionable balls.
  const tints = [
    "#fff4e416",
    "#f5dce81a",
    "#e4f3ee1a",
    "#e1effa1a",
    "#f8ebd51c",
    "#ece5fa1c",
    "#dcefea1c",
    "#ffe8da1c",
  ];
  c.fillStyle = tints[recipe.tint];
  c.fillRect(0, 0, 768, 256);
  c.fillStyle = "#fff8ee14";
  c.fillRect(0, 0, 768, 256);
  return canvas as unknown as CanvasImageSource;
}
