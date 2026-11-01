import { PRESETS, RULE, CONFIG } from "../src/config";
import { generate } from "../src/core/generation";
import { take, invariant, faceVisible } from "../src/core/rules";
import { writeFileSync } from "node:fs";
const start = performance.now();
const results = [];
for (const p of PRESETS)
  for (let i = 0; i < 100; i++) {
    const seed = p.seed + i,
      t = performance.now(),
      l = generate(p, seed);
    if (l.board.tubes.some((t) => t.balls.length !== 5) || l.witness.length % 3)
      throw Error("five-ball preset invalid");
    let turns = 0,
      view = 0;
    for (const v of l.views) {
      if (v !== view) turns++;
      view = v;
    }
    let b = l.board;
    for (let step = 0; step < l.witness.length; step++) {
      if (!faceVisible(b, l.views[step]).has(l.witness[step]))
        throw Error("not exposed");
      b = take(b, l.witness[step], `verify-${step}`);
      if (!invariant(b, l.witness.length)) throw Error("invariant");
    }
    if (b.status !== "won") throw Error("not won");
    results.push({
      preset: p.id,
      seed,
      moves: l.witness.length,
      turns,
      activeBudgetMsPerPick: +(CONFIG.baseMs / l.witness.length).toFixed(2),
      animationOnlyWallMs:
        l.witness.length * CONFIG.animationMs + turns * CONFIG.rotateMs,
      score: b.score,
      ms: +(performance.now() - t).toFixed(2),
      passed: true,
    });
  }
const evidence = {
  rule: RULE,
  verifiedSeeds: results.length,
  totalMs: +(performance.now() - start).toFixed(2),
  scope:
    "Pure reducer replay, no ads; not human timing or real device validation",
  results,
};
writeFileSync("evidence/seeds.json", JSON.stringify(evidence, null, 2));
console.log(
  `Verified ${results.length} seeds across 3 presets, all witnesses won with identity conservation, ${evidence.totalMs}ms`,
);
