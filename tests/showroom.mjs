import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const server = spawn(process.execPath, ["scripts/serve.mjs"], {
  env: { ...process.env, PORT: "4185" },
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
    const height = width === 320 ? 660 : 844,
      p = await browser.newPage({ viewport: { width, height } });
    await p.goto("http://127.0.0.1:4185");
    await p.waitForFunction(() => tri?.scene.playBackgroundLoaded);
    const click = async (id) => {
      const b = await p.evaluate(
        (id) => tri.scene.buttons.find((b) => b.id === id),
        id,
      );
      assert.ok(b, id);
      await p.mouse.click(b.x + b.w / 2, b.y + b.h / 2);
      await p.waitForTimeout(30);
    };
    await p.screenshot({ path: `evidence/v024-showroom-home-${width}.png` });
    await click("help");
    for (let step = 0; step < 3; step++) {
      const state = await p.evaluate(() => ({
        step: tri.scene.guideStep,
        targets: tri.scene.targets.length,
        buttons: tri.scene.buttons,
        remaining: tri.game.state.remaining,
      }));
      assert.equal(state.step, step);
      assert.equal(state.targets, 0);
      assert.equal(state.remaining, 300000);
      for (const b of state.buttons)
        assert.ok(
          b.x >= 0 && b.y >= 0 && b.x + b.w <= width && b.y + b.h + 8 <= height,
        );
      await p.screenshot({
        path: `evidence/v024-showroom-guide-${width}-${step}.png`,
      });
      await click("guide-next");
    }
    assert.equal(await p.evaluate(() => tri.game.guideSeen), true);
    await p.reload();
    await p.waitForFunction(() => tri?.scene.playBackgroundLoaded);
    assert.equal(await p.evaluate(() => tri.game.guideSeen), true);
    await click("start-menu");
    await p.screenshot({
      path: `evidence/v024-showroom-difficulty-${width}.png`,
    });
    await click("start-1");
    await p.evaluate(() => {
      tri.game.skipIntro();
      tri.scene.render();
    });
    assert.equal(
      await p.evaluate(() =>
        tri.scene.buttons.some((b) => b.id === "guide-open"),
      ),
      false,
    );
    await click("begin");
    await p.screenshot({ path: `evidence/v024-showroom-play-${width}.png` });
    await p.evaluate(() => {
      tri.game.phase = "result";
      tri.game.board.status = "won";
      tri.game.board.score = 1234;
      tri.scene.render();
    });
    await p.screenshot({ path: `evidence/v024-showroom-win-${width}.png` });
    await p.waitForFunction(() => tri.scene.celebrationMs === 2600);
    assert.equal(await p.evaluate(() => tri.game.board.score), 1234);
    await p.screenshot({
      path: `evidence/v024-showroom-win-settled-${width}.png`,
    });
    reports.push({
      width,
      guideThreeSteps: true,
      guidePersistence: true,
      readyHelpRemovedAndNoTimeCharge: true,
      confettiFinite: true,
      noFakeReward: true,
    });
    await p.close();
  }
  await writeFile(
    "evidence/v0.1.24-showroom.json",
    JSON.stringify(
      { platform: "Actual Chromium pixels and input, not WeChat", reports },
      null,
      2,
    ),
  );
  console.log(reports);
} finally {
  await browser.close();
  server.kill();
}
