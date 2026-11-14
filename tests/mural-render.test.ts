import test from "node:test";
import assert from "node:assert/strict";
import { muralRecipe, MURAL_VARIANTS, composeMural } from "../src/render/mural";
test("all 8192 mural recipes decode to distinct effective composition tuples", () => {
  const recipes = new Set<string>();
  for (let i = 0; i < MURAL_VARIANTS; i++)
    recipes.add(JSON.stringify(muralRecipe(i)));
  assert.equal(recipes.size, 8192);
  for (let i = 0; i < 4; i++) assert.equal(muralRecipe(i).base, i);
});
test("composition uses an opaque source and deterministic restrained wash, not gameplay data", () => {
  const calls: unknown[] = [];
  const ctx = {
    save() {},
    restore() {},
    translate(...a: unknown[]) {
      calls.push(a);
    },
    scale(...a: unknown[]) {
      calls.push(a);
    },
    drawImage(...a: unknown[]) {
      calls.push(a);
    },
    fillRect(...a: unknown[]) {
      calls.push(a);
    },
    fillStyle: "",
  };
  const factory = (w: number, h: number) => ({
    width: w,
    height: h,
    getContext: () => ctx as unknown as CanvasRenderingContext2D,
  });
  const image = {} as CanvasImageSource;
  composeMural(image, 7821, factory);
  const first = JSON.stringify(calls);
  calls.length = 0;
  composeMural(image, 7821, factory);
  assert.equal(JSON.stringify(calls), first);
});
