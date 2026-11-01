import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const server = spawn(process.execPath, ["scripts/serve.mjs"], {
  stdio: "pipe",
});
await new Promise((resolve, reject) => {
  server.stdout.once("data", resolve);
  server.once("error", reject);
});
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const results = [];
async function click(id) {
  await page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  await page.waitForFunction(
    (id) => window.tri.scene.buttons.some((b) => b.id === id && !b.disabled),
    id,
  );
  const b = await page.evaluate(
    (id) => window.tri.scene.buttons.find((b) => b.id === id),
    id,
  );
  await page.mouse.click(b.x + b.w / 2, b.y + b.h / 2);
  await page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
}
async function phase(value) {
  await page.waitForFunction((value) => window.tri.game.phase === value, value);
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
    if (preset === 0) {
      await page.screenshot({ path: "evidence/board.png" });
      await click("rotate-right");
      await phase("active");
      await click("pause");
      await phase("paused");
      const saved = await page.evaluate(() => window.tri.game.state.remaining);
      await page.reload();
      await phase("home");
      const homeSnapshot = await page.evaluate(() =>
        JSON.stringify(localStorage),
      );
      for (let cycle = 0; cycle < 3; cycle++) {
        await page.reload();
        await phase("home");
        assert.equal(
          await page.evaluate(() => JSON.stringify(localStorage)),
          homeSnapshot,
        );
      }
      results.push(
        "unclaimed home pagehide/reload preserves main and backup across 3 restarts",
      );
      await click("resume");
      await phase("paused");
      assert.equal(
        await page.evaluate(() => window.tri.game.state.remaining),
        saved,
      );
      await click("continue");
      await phase("active");
      results.push("pause, reload, resume preserve state");
    }
    const witness = await page.evaluate(
      (p) => window.tri.createLevel(p).witness,
      preset,
    );
    // Ensure every tube has an unambiguous, non-overlapping selector on some page.
    const allButtons = [];
    const pageCount = await page.evaluate(() =>
      Math.ceil(window.tri.game.board.tubes.length / 10),
    );
    for (let i = 0; i < pageCount; i++) {
      const buttons = await page.evaluate(() =>
        window.tri.scene.buttons.filter((b) => b.id.startsWith("tube-")),
      );
      allButtons.push(...buttons.map((b) => b.id));
      for (const b of buttons)
        assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= 390 && b.y + b.h <= 844);
      if (pageCount > 1) await click("page");
    }
    assert.equal(
      new Set(allButtons).size,
      await page.evaluate(() => window.tri.game.board.tubes.length),
    );
    for (const id of witness) {
      for (let i = 0; i < pageCount; i++) {
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
      await page.waitForFunction(() =>
        ["active", "result"].includes(window.tri.game.phase),
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
      `preset ${preset}: ${witness.length} actual pointer selections, no ads, won`,
    );
  }
  await page.screenshot({ path: "evidence/result.png" });
  await page.setViewportSize({ width: 320, height: 660 });
  await click("home");
  await click("start-2");
  await phase("ready");
  await click("begin");
  await phase("active");
  const buttons = await page.evaluate(() => window.tri.scene.buttons);
  for (const b of buttons)
    assert.ok(
      b.x >= 0 && b.y >= 0 && b.x + b.w <= 320 && b.y + b.h <= 660,
      `offscreen ${b.id}`,
    );
  await page.screenshot({ path: "evidence/narrow.png" });
  results.push("320×660 controls within viewport");
  await click("pause");
  await click("end");
  await click("home");
  const endedSnapshot = await page.evaluate(() => JSON.stringify(localStorage));
  for (let cycle = 0; cycle < 3; cycle++) {
    await page.reload();
    await phase("home");
    assert.equal(
      await page.evaluate(() => JSON.stringify(localStorage)),
      endedSnapshot,
    );
    assert.equal(await page.evaluate(() => window.tri.game.resume), null);
  }
  results.push(
    "manually ended non-winning round stays final through 3 home restarts",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    "evidence/e2e.json",
    JSON.stringify(
      { passed: true, platform: "Chromium browser only", results, errors },
      null,
      2,
    ),
  );
  console.log(results.join("\n"));
} catch (error) {
  console.error(
    await page.evaluate(() => ({
      phase: window.tri.game.phase,
      buttons: window.tri.scene.buttons.map((b) => ({
        id: b.id,
        x: b.x,
        y: b.y,
        disabled: b.disabled,
      })),
    })),
  );
  await page.screenshot({ path: "evidence/e2e-failure.png" });
  throw error;
} finally {
  await browser.close();
  server.kill();
}
