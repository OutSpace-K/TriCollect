import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const server = spawn(process.execPath, ["scripts/serve.mjs"], {
  env: { ...process.env, PORT: "4174" },
  stdio: "pipe",
});
await new Promise((r, j) => {
  server.stdout.once("data", r);
  server.once("error", j);
});
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const results = [];
async function stable() {
  await page.waitForFunction(() => tri.game.phase === "active");
  await page.waitForTimeout(35);
}
async function click(id) {
  const b = await page.evaluate(
    (id) => tri.scene.buttons.find((b) => b.id === id && !b.disabled),
    id,
  );
  assert.ok(b, id);
  await page.mouse.click(b.x + b.w / 2, b.y + b.h / 2);
  await page.waitForTimeout(20);
}
async function visibility() {
  const report = await page.evaluate(() => {
    const { game: g, scene: s } = tri,
      expected = new Map();
    for (const t of g.board.tubes.filter((t) => t.balls.length)) {
      const axes = [t.q, t.r, g.board.side - 1 - t.q - t.r],
        lane = axes[g.state.view],
        depth = axes[(g.state.view + 1) % 3];
      if (!expected.has(lane) || depth < expected.get(lane).depth)
        expected.set(lane, { id: t.id, depth });
    }
    return {
      expected: [...expected.values()].map((t) => t.id).sort(),
      drawn: [...s.renderedIds].sort(),
      targets: s.targets.map((t) => t.id).sort(),
      view: g.state.view,
      face: s.renderedFace,
      silhouettes: s.silhouetteIds,
      openings: s.rearOpenings,
      remaining: g.board.tubes.filter((t) => t.balls.length).map((t) => t.id),
    };
  });
  assert.deepEqual(report.drawn, report.expected);
  assert.deepEqual(
    [...report.drawn, ...report.silhouettes].sort(),
    report.remaining.sort(),
  );
  assert.ok(report.silhouettes.every((id) => !report.targets.includes(id)));
  assert.deepEqual(report.targets, report.expected);
  assert.equal(report.face, report.view);
  for (const opening of report.openings) {
    assert.ok(
      opening.y - opening.ry >= 192,
      "rear opening must stay below face header",
    );
  }
  const before = await page.evaluate(() => tri.game.state.history.length);
  for (const opening of report.openings)
    await page.mouse.click(opening.x, opening.y);
  assert.equal(
    await page.evaluate(() => tri.game.state.history.length),
    before,
    "rear opening clicks must never pick balls",
  );
  await click("select");
  const ids = await page.evaluate(() =>
    tri.scene.buttons
      .filter((b) => b.id.startsWith("tube-"))
      .map((b) => b.id.slice(5))
      .sort(),
  );
  assert.deepEqual(ids, report.expected);
  await click("close-select");
  return report;
}
try {
  await page.goto("http://127.0.0.1:4174");
  await page.waitForFunction(() => window.tri);
  await page.evaluate(() => {
    tri.game.start();
    tri.game.skipIntro();
    tri.game.begin();
  });
  await stable();
  for (let face = 0; face < 3; face++) {
    results.push(await visibility());
    await page.screenshot({ path: `evidence/v014-face-${face + 1}.png` });
    await click("rotate-right");
    await stable();
  }
  for (let i = 0; i < 3; i++) {
    const t = await page.evaluate(() =>
      tri.scene.targets.find((t) => t.id === "1,0"),
    );
    await page.mouse.click(t.x, t.y);
    await stable();
  }
  const revealed = await visibility();
  assert.ok(revealed.drawn.includes("1,1"));
  assert.ok(!revealed.drawn.includes("1,0"));
  results.push({ innerReveal: revealed });
  await page.screenshot({ path: "evidence/v014-inner.png" });
  await page.evaluate(() => {
    tri.game.start();
    tri.game.skipIntro();
    tri.game.begin();
  });
  await stable();
  for (let i = 0; i < 7; i++) await click("rotate-right");
  assert.equal(await page.evaluate(() => tri.game.state.view), 1);
  assert.equal(await page.evaluate(() => tri.scene.targets.length), 0);
  await stable();
  await visibility();
  results.push(
    "7 rapid pointer turns preserve net requested face; no targets during transition",
  );
  await click("rotate-left");
  await click("pause");
  assert.equal(await page.evaluate(() => tri.game.state.view), 0);
  await click("continue");
  await stable();
  await visibility();
  await page.setViewportSize({ width: 320, height: 660 });
  await page.evaluate(() => {
    tri.game.start(2);
    tri.game.skipIntro();
    tri.game.begin();
  });
  await stable();
  await visibility();
  const targets = await page.evaluate(() => tri.scene.targets);
  assert.equal(targets.length, 8);
  for (const t of targets) assert.ok(t.x - t.r >= 0 && t.x + t.r <= 320);
  await page.screenshot({ path: "evidence/v014-narrow.png" });
  results.push("320x660: 36 tubes, 8 visible front targets within viewport");
  await writeFile(
    "evidence/v0.1.4-visual-qa.json",
    JSON.stringify(
      { passed: true, platform: "Chromium, not WeChat DevTools", results },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
  server.kill();
}
