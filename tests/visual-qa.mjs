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
    const covered = new Set();
    const ordered = g.board.tubes
      .filter((t) => t.balls.length)
      .map((t) => {
        const axes = [t.q, t.r, g.board.side - 1 - t.q - t.r];
        return {
          id: t.id,
          lane: axes[g.state.view],
          depth: axes[(g.state.view + 1) % 3],
        };
      })
      .sort((a, b) => a.depth - b.depth);
    for (const t of ordered) {
      const h = 2 * t.lane + t.depth,
        segments = [h - 1, h];
      if (segments.every((x) => !covered.has(x))) expected.set(t.id, t);
      segments.forEach((x) => covered.add(x));
    }
    return {
      expected: [...expected.values()].map((t) => t.id).sort(),
      drawn: [...s.renderedIds].sort(),
      targets: s.targets.map((t) => t.id).sort(),
      view: g.state.view,
      face: s.renderedFace,
      silhouettes: s.silhouetteIds,
      openings: s.rearOpenings,
      balls: s.visibleBalls,
      actual: g.board.tubes.map((t) => ({
        id: t.id,
        top: t.balls.slice(-3).map((b) => b.id),
      })),
      layout: s.tubeLayout,
      remaining: g.board.tubes.filter((t) => t.balls.length).map((t) => t.id),
    };
  });
  assert.deepEqual(report.drawn, report.expected);
  for (const tube of report.balls) {
    assert.ok(tube.ids.length <= 3);
    assert.deepEqual(
      tube.ids,
      report.actual.find((t) => t.id === tube.tube).top,
    );
  }
  if (report.remaining.length === 21) {
    for (let depth = 0; depth < 6; depth++) {
      const row = report.layout
        .filter((t) => t.depth === depth)
        .sort((a, b) => a.x - b.x);
      assert.ok(Math.abs((row[0].x + row.at(-1).x) / 2 - 195) < 0.01);
      for (let i = 1; i < row.length; i++)
        assert.ok(
          Math.abs(row[i].x - row[i - 1].x - row[i].r - row[i - 1].r) < 0.01,
        );
    }
  }
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
    tri.game.start(0, 104730);
    tri.game.skipIntro();
    tri.game.begin();
  });
  await stable();
  const second = await page.evaluate(() =>
    tri.scene.ballPositions.find((b) => b.tube === "1,0" && b.slot === 3),
  );
  await page.mouse.click(second.x, second.y);
  assert.equal(
    await page.evaluate(() => tri.game.state.history.length),
    0,
    "second visible ball is not selectable",
  );
  for (let face = 0; face < 3; face++) {
    results.push(await visibility());
    await page.screenshot({ path: `evidence/v016-face-${face + 1}.png` });
    await click("rotate-right");
    await stable();
  }
  const fixedReports = [];
  await page.screenshot({ path: "evidence/v016-slots-before.png" });
  for (const id of ["1,0", "2,0"]) {
    for (let i = 0; i < 5; i++) {
      const before = await page.evaluate(() => tri.scene.ballPositions);
      const target = await page.evaluate(
        (id) => tri.scene.targets.find((t) => t.id === id),
        id,
      );
      const oldTop = before
        .filter((b) => b.tube === id)
        .sort((a, b) => b.slot - a.slot)[0];
      await page.mouse.click(target.x, target.y);
      await page.waitForTimeout(30);
      const origin = await page.evaluate(() => tri.scene.flightOrigin);
      const during = await page.evaluate(
        (id) => tri.scene.visibleBalls.find((t) => t.tube === id)?.ids ?? [],
        id,
      );
      assert.ok(
        during.length + 1 <= 3,
        "pipe survivors plus departing ball must never exceed three",
      );
      assert.ok(origin);
      assert.equal(origin.id, oldTop.id);
      assert.equal(origin.x, oldTop.x);
      assert.equal(origin.y, oldTop.y);
      await stable();
      const after = await page.evaluate(() => tri.scene.ballPositions);
      for (const old of before) {
        const same = after.find((b) => b.id === old.id);
        if (same)
          assert.deepEqual(same, old, "remaining world slots must not move");
      }
      fixedReports.push({
        tube: id,
        pick: i + 1,
        removed: oldTop,
        remaining: after.filter((b) => b.tube === id),
      });
      await visibility();
      if (id === "1,0" && i < 2)
        await page.screenshot({
          path: `evidence/v016-slots-after-${i + 1}.png`,
        });
    }
    if (id === "1,0")
      assert.ok(
        !(await page.evaluate(() => tri.scene.renderedIds)).includes("1,1"),
        "side half exposure is not front access",
      );
  }
  const revealed = await visibility();
  assert.ok(revealed.drawn.includes("1,1"));
  results.push({ fixedSlots: fixedReports, innerReveal: revealed });
  await page.screenshot({ path: "evidence/v016-inner.png" });
  await click("undo");
  await stable();
  const restored = await page.evaluate(() => tri.scene.ballPositions);
  const last = fixedReports.at(-1).removed;
  assert.deepEqual(
    restored.find((b) => b.id === last.id),
    last,
    "undo restores original slot",
  );
  await click("pause");
  await page.reload();
  await page.waitForFunction(() => window.tri);
  await click("resume");
  await click("continue");
  await stable();
  assert.deepEqual(
    await page.evaluate(() => tri.scene.ballPositions),
    restored,
    "saved slot coordinates survive restart",
  );
  await page.evaluate(() => {
    tri.game.start();
    tri.game.skipIntro();
    tri.game.begin();
    window.originalNow = tri.game.now;
    window.rotationTime = tri.game.now();
    tri.game.now = () => window.rotationTime;
    tri.scene.render();
  });
  const centered = await page.evaluate(() => ({
    points: tri.scene.tubeLayout,
    axis: tri.scene.rotationAxis,
    scale: tri.scene.projectionScale,
  }));
  await page.evaluate(() => tri.game.rotate(1));
  const rotation = [];
  for (const elapsed of [0, 62.5, 125, 187.5, 250]) {
    await page.evaluate((elapsed) => {
      window.rotationTime = window.rotationBase ?? window.rotationTime;
      window.rotationBase ??= window.rotationTime;
      window.rotationTime = window.rotationBase + elapsed;
      tri.game.tick();
      tri.scene.render();
    }, elapsed);
    const frame = await page.evaluate(() => ({
      points: tri.scene.tubeLayout,
      axis: tri.scene.rotationAxis,
      scale: tri.scene.projectionScale,
      targets: tri.scene.targets.length,
    }));
    assert.deepEqual(frame.axis, centered.axis);
    assert.deepEqual(frame.scale, centered.scale);
    for (const p of frame.points) {
      const old = centered.points.find((t) => t.id === p.id);
      const distance = (t) =>
        Math.hypot(
          (t.x - frame.axis.x) / frame.scale.x,
          (t.y - frame.axis.y) / frame.scale.z,
        );
      assert.ok(Math.abs(distance(p) - distance(old)) < 1e-8);
      assert.equal(p.r, old.r);
    }
    assert.ok(
      Math.abs(
        frame.points.reduce((sum, p) => sum + p.x, 0) / frame.points.length -
          frame.axis.x,
      ) < 1e-8,
    );
    if (elapsed < 250) assert.equal(frame.targets, 0);
    rotation.push({ elapsed, ...frame });
    if (elapsed === 125)
      await page.screenshot({ path: "evidence/v016-center-rotation.png" });
  }
  results.push({ centeredRigidRotation: rotation });
  await page.evaluate(() => {
    tri.game.now = window.originalNow;
  });
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
  await page.screenshot({ path: "evidence/v016-narrow.png" });
  results.push("320x660: 36 tubes, 8 visible front targets within viewport");
  await writeFile(
    "evidence/v0.1.6-visual-qa.json",
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
