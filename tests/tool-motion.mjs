import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const server = spawn(process.execPath, ["scripts/serve.mjs"], {
  env: { ...process.env, PORT: "4190" },
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
  for (const [width, height] of [
    [320, 568],
    [390, 844],
  ]) {
    const p = await browser.newPage({ viewport: { width, height } });
    await p.goto("http://127.0.0.1:4190");
    await p.waitForFunction(() => tri?.scene.playBackgroundLoaded);
    await p.evaluate(() => {
      window.motionTime = 1000;
      tri.game.now = () => motionTime;
      tri.game.start(0, 123);
      tri.game.skipIntro();
      tri.game.begin();
      tri.scene.render();
    });
    const rect = async (id) =>
      p.evaluate((id) => {
        tri.scene.render();
        const b = tri.scene.buttons.find((b) => b.id === id),
          c = document.querySelector("canvas").getBoundingClientRect(),
          s = c.height / tri.scene.height;
        return {
          x: c.x + b.x * s,
          y: c.y + b.y * s,
          width: b.w * s,
          height: b.h * s,
          disabled: b.disabled,
          dimmed: b.dimmed,
        };
      }, id);
    const shot = async (id) => {
      const { x, y, width, height } = await rect(id);
      return p.screenshot({ clip: { x, y, width, height } });
    };
    const click = async (id) => {
      const b = await rect(id);
      await p.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    };
    const pick = async () => {
      const t = await p.evaluate(() => {
        const t = tri.scene.targets[0],
          c = document.querySelector("canvas").getBoundingClientRect(),
          s = c.height / tri.scene.height;
        return { x: c.x + t.x * s, y: c.y + t.y * s };
      });
      await p.mouse.click(t.x, t.y);
    };
    const settle = () =>
      p.evaluate(() => {
        motionTime += 300;
        tri.game.tick();
        tri.scene.render();
      });
    for (const id of ["lift-ball", "return-ball"]) {
      if (id === "return-ball") {
        await p.evaluate(async () => {
          tri.game.ads = {
            available: true,
            label: "test only",
            request: async () => "completed",
          };
          await tri.game.liftBall();
          tri.game.begin();
          tri.scene.render();
        });
      }
      const baseline = await shot(id);
      await pick();
      const board = await p.evaluate(() => JSON.stringify(tri.game.board));
      assert.equal((await rect(id)).disabled, true);
      assert.equal((await rect(id)).dimmed, false);
      assert.ok(baseline.equals(await shot(id)), `${id} pick pixels changed`);
      await click(id);
      assert.equal(
        await p.evaluate(() => JSON.stringify(tri.game.board)),
        board,
      );
      assert.equal(await p.evaluate(() => tri.scene.toolDialog), null);
      await settle();
      const beforeTurn = await shot(id);
      await click("rotate-right");
      assert.equal((await rect(id)).disabled, true);
      assert.equal((await rect(id)).dimmed, false);
      assert.ok(beforeTurn.equals(await shot(id)), `${id} turn pixels changed`);
      await click(id);
      assert.equal(
        await p.evaluate(() => JSON.stringify(tri.game.board)),
        board,
      );
      await settle();
    }
    reports.push({
      width,
      height,
      toolPixelsUnchangedDuringPickAndTurn: true,
      heldBallPixelsUnchanged: true,
      lockedClicksIgnored: true,
    });
    await p.close();
  }
  await writeFile(
    "evidence/v0.1.24-tool-motion.json",
    JSON.stringify({ reports }, null, 2),
  );
  console.log(reports);
} finally {
  await browser.close();
  server.kill();
}
