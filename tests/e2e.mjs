import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const server = spawn(process.execPath, ["scripts/serve.mjs"], {
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
const page = await browser.newPage({ viewport: { width: 390, height: 844 } }),
  errors = [],
  results = [];
let directPicks = 0,
  fallbackPicks = 0;
page.on("pageerror", (e) => errors.push(String(e)));
const frame = () =>
  page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
async function click(id) {
  await frame();
  await page.waitForFunction(
    (id) => window.tri.scene.buttons.some((b) => b.id === id && !b.disabled),
    id,
  );
  const b = await page.evaluate(
    (id) => window.tri.scene.buttons.find((b) => b.id === id),
    id,
  );
  await page.mouse.click(b.x + b.w / 2, b.y + b.h / 2);
  await frame();
}
const phase = (p) =>
  page.waitForFunction((p) => window.tri.game.phase === p, p);
async function pick(id) {
  for (let turn = 0; turn < 3; turn++) {
    const target = await page.evaluate(
      (id) => window.tri.scene.targets.find((t) => t.id === id),
      id,
    );
    if (target) {
      await page.mouse.click(target.x, target.y);
      await frame();
      directPicks++;
      return;
    }
    await click("rotate-right");
    assert.equal(await page.evaluate(() => window.tri.game.phase), "active");
  }
  await click("select");
  const index = await page.evaluate(
    (id) => window.tri.game.board.tubes.findIndex((t) => t.id === id),
    id,
  );
  for (let i = 0; i < 3; i++) {
    if (
      await page.evaluate(
        (id) => window.tri.scene.buttons.some((b) => b.id === "tube-" + id),
        id,
      )
    )
      break;
    await click("page");
  }
  await click("tube-" + id);
  fallbackPicks++;
}
try {
  await page.goto("http://127.0.0.1:4173");
  await phase("home");
  await page.screenshot({ path: "evidence/home.png" });
  for (let preset = 0; preset < 3; preset++) {
    if (preset > 0) await click("home");
    await click("start-" + preset);
    await phase("ready");
    await click("begin");
    await phase("active");
    assert.equal(
      await page.evaluate(() =>
        window.tri.scene.buttons.some((b) => b.id.startsWith("tube-")),
      ),
      false,
    );
    assert.equal(await page.evaluate(() => window.tri.scene.buttons.length), 6);
    if (preset === 0) {
      const before = await page.evaluate(() => ({
        time: performance.now(),
        remaining: window.tri.game.state.remaining,
      }));
      await page.waitForTimeout(10000);
      const after = await page.evaluate(() => ({
        time: performance.now(),
        remaining: window.tri.game.state.remaining,
      }));
      const elapsed = after.time - before.time,
        charged = before.remaining - after.remaining;
      assert.ok(Math.abs(elapsed - charged) < 100);
      results.push({
        check: "browser real 10-second clock",
        elapsedMs: elapsed,
        chargedMs: charged,
      });
      for (let i = 0; i < 12; i++) {
        await click("rotate-right");
        assert.equal(
          await page.evaluate(() => window.tri.game.phase),
          "active",
        );
        assert.equal(
          await page.evaluate(() => window.tri.game.state.view),
          (i + 1) % 3,
        );
      }
      results.push(
        "12 consecutive pointer rotations immediately active, no interpolation lock",
      );
      await page.screenshot({ path: "evidence/board.png" });
      await click("pause");
      const saved = await page.evaluate(() => window.tri.game.state.remaining);
      await page.waitForTimeout(250);
      assert.equal(
        await page.evaluate(() => window.tri.game.state.remaining),
        saved,
      );
      await page.reload();
      await phase("home");
      const snapshot = await page.evaluate(() => JSON.stringify(localStorage));
      for (let i = 0; i < 3; i++) {
        await page.reload();
        await phase("home");
        assert.equal(
          await page.evaluate(() => JSON.stringify(localStorage)),
          snapshot,
        );
      }
      await click("resume");
      await phase("paused");
      assert.equal(
        await page.evaluate(() => window.tri.game.state.remaining),
        saved,
      );
      await click("continue");
      await page.evaluate(() => {
        const s = window.tri.scene,
          original = s.render.bind(s);
        s.render = () => {
          s.render = original;
          throw Error("injected one-frame render fault");
        };
      });
      await phase("paused");
      await click("continue");
      await phase("active");
      results.push(
        "one-frame exception recovered; pause/home/reload regression preserved",
      );
    }
    const witness = await page.evaluate(
      (p) => window.tri.createLevel(p).witness,
      preset,
    );
    for (let step = 0; step < witness.length; step++) {
      await pick(witness[step]);
      await page.waitForFunction(() =>
        ["active", "result"].includes(window.tri.game.phase),
      );
      assert.equal(
        await page.evaluate(() => window.tri.game.state.history.length),
        step + 1,
      );
    }
    await phase("result");
    assert.equal(
      await page.evaluate(() => window.tri.game.board.status),
      "won",
    );
    assert.equal(
      await page.evaluate(() => window.tri.game.state.extensions),
      0,
    );
    results.push(
      `preset ${preset}: ${witness.length} pointer picks won without ads`,
    );
  }
  await page.screenshot({ path: "evidence/result.png" });
  await page.setViewportSize({ width: 320, height: 660 });
  await click("home");
  await click("start-2");
  await phase("ready");
  await click("begin");
  await phase("active");
  for (const b of await page.evaluate(() => window.tri.scene.buttons))
    assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= 320 && b.y + b.h <= 660);
  await page.screenshot({ path: "evidence/narrow.png" });
  await click("select");
  await page.screenshot({ path: "evidence/optional-selector.png" });
  await click("close-select");
  await click("pause");
  await click("end");
  await click("home");
  const snapshot = await page.evaluate(() => JSON.stringify(localStorage));
  for (let i = 0; i < 3; i++) {
    await page.reload();
    await phase("home");
    assert.equal(
      await page.evaluate(() => JSON.stringify(localStorage)),
      snapshot,
    );
    assert.equal(await page.evaluate(() => window.tri.game.resume), null);
  }
  assert.deepEqual(errors, []);
  assert.ok(directPicks > 0);
  await writeFile(
    "evidence/e2e.json",
    JSON.stringify(
      {
        passed: true,
        platform: "Chromium only; not WeChat device",
        directPicks,
        fallbackPicks,
        results,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ directPicks, fallbackPicks, results }, null, 2));
} catch (e) {
  console.error(
    await page.evaluate(() => ({
      phase: window.tri.game.phase,
      message: window.tri.game.message,
    })),
  );
  throw e;
} finally {
  await browser.close();
  server.kill();
}
