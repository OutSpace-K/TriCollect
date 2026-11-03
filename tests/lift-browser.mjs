import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const server = spawn(process.execPath, ["scripts/serve.mjs"], {
  env: { ...process.env, PORT: "4187" },
  stdio: "pipe",
});
await new Promise((r) => server.stdout.once("data", r));
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
const reports = [];
try {
  for (const width of [320, 390]) {
    const p = await browser.newPage({
      viewport: { width, height: width === 320 ? 660 : 844 },
    });
    const errors = [];
    p.on("pageerror", (e) => errors.push(String(e)));
    await p.goto("http://127.0.0.1:4187");
    await p.waitForFunction(() => tri?.scene.playBackgroundLoaded);
    await p.screenshot({ path: `evidence/v024-home-${width}.png` });
    const click = async (id) => {
      await p.waitForFunction(
        (id) => tri.scene.buttons.some((b) => b.id === id && !b.disabled),
        id,
      );
      const b = await p.evaluate(
        (id) => tri.scene.buttons.find((b) => b.id === id),
        id,
      );
      await p.mouse.click(b.x + b.w / 2, b.y + b.h / 2);
    };
    await click("start-menu");
    await click("start-0");
    await p.waitForFunction(() => tri.game.phase === "ready");
    assert.equal(
      await p.evaluate(() =>
        tri.scene.buttons.some((b) => b.id === "guide-open"),
      ),
      false,
    );
    await click("begin");
    await p.evaluate(() => {
      const g = tri.game,
        l = tri.createLevel(0, g.state.seed);
      g.state.view = l.views[0];
      g.pick(l.witness[0]);
    });
    await p.waitForFunction(() => tri.game.phase === "active");
    const before = await p.evaluate(() => JSON.stringify(tri.game.board));
    p.once("dialog", (d) => d.dismiss());
    await click("lift-ball");
    await click("tool-confirm");
    await p.waitForFunction(() => tri.game.phase === "paused");
    assert.equal(
      await p.evaluate(() => JSON.stringify(tri.game.board)),
      before,
    );
    await click("continue");
    p.once("dialog", (d) => d.accept());
    await click("lift-ball");
    await click("tool-confirm");
    await p.waitForFunction(() => tri.game.phase === "paused");
    assert.equal(await p.evaluate(() => tri.game.board.pocket.length), 1);
    await p.reload();
    await click("resume");
    await click("continue");
    await p.screenshot({ path: `evidence/v024-pocket-${width}.png` });
    for (const b of await p.evaluate(() => tri.scene.buttons))
      assert.ok(
        b.x >= 0 &&
          b.y >= 0 &&
          b.x + b.w <= width &&
          b.y + b.h <= (width === 320 ? 660 : 844),
      );
    await click("return-ball");
    assert.equal(await p.evaluate(() => tri.game.board.pocket.length), 0);
    await click("undo");
    assert.equal(await p.evaluate(() => tri.game.board.pocket.length), 1);
    assert.equal(await p.evaluate(() => tri.game.canUndo), false);
    assert.deepEqual(errors, []);
    reports.push({
      width,
      cancelPreservesBoard: true,
      completedMockOnly: true,
      reloadPreservesPocket: true,
      freeReturnAndSingleUndo: true,
      errors,
    });
    await p.close();
  }
  await writeFile(
    "evidence/v0.1.24-lift-browser.json",
    JSON.stringify(
      { platform: "Chromium only; no real ads or device", reports },
      null,
      2,
    ),
  );
  console.log(reports);
} finally {
  await browser.close();
  server.kill();
}
