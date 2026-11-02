import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const server = spawn(process.execPath, ["scripts/serve.mjs"], {
  env: { ...process.env, PORT: "4183" },
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
      page = await browser.newPage({ viewport: { width, height } });
    await page.goto("http://127.0.0.1:4183");
    await page.waitForFunction(() => window.tri?.scene.playBackgroundLoaded);
    async function click(id) {
      await page.waitForFunction(
        (id) => tri.scene.buttons.some((b) => b.id === id && !b.disabled),
        id,
      );
      const b = await page.evaluate(
        (id) => tri.scene.buttons.find((b) => b.id === id),
        id,
      );
      await page.mouse.click(b.x + b.w / 2, b.y + b.h / 2);
      await page.waitForTimeout(40);
    }
    await page.evaluate(() => {
      window.decorTime = 0;
      tri.game.now = () => window.decorTime;
      tri.scene.setForeground(true);
      tri.scene.render();
    });
    await page.screenshot({
      path: `evidence/v016-current-home-title-${width}-0.png`,
    });
    const animation = await page.evaluate(() => {
      const s = tri.scene;
      let prev = s.trackObjects.map((o) => o.x),
        wraps = 0;
      for (let i = 0; i < 1000; i++) {
        window.decorTime += 16;
        s.render();
        const next = s.trackObjects.map((o) => o.x);
        for (let j = 0; j < next.length; j++) {
          if (next[j] < prev[j]) {
            if (!(prev[j] > s.width + 12 && next[j] < -12))
              throw Error("visible seam");
            wraps++;
          } else if (next[j] - prev[j] > 1) throw Error("speed jump");
        }
        prev = next;
      }
      const before = s.decorationTime;
      s.setForeground(false);
      window.decorTime += 90000;
      s.render();
      if (s.decorationTime !== before) throw Error("background moved");
      s.setForeground(true);
      s.render();
      if (s.decorationTime !== before) throw Error("resume jump");
      window.decorTime += 16;
      s.render();
      return { wraps, paused: true, resumeDelta: s.decorationTime - before };
    });
    assert.ok(animation.wraps >= 5);
    assert.equal(animation.resumeDelta, 16);
    await page.screenshot({
      path: `evidence/v016-current-home-title-${width}-moving.png`,
    });
    await click("start-menu");
    await page.screenshot({
      path: `evidence/v016-current-difficulty-${width}.png`,
    });
    const tiers = await page.evaluate(() =>
      tri.scene.buttons.filter((b) => /^start-[012]$/.test(b.id)),
    );
    assert.equal(tiers.length, 3);
    assert.ok(tiers.every((b) => b.x === tiers[0].x));
    const session = await page.evaluate(() => tri.game.state.session);
    await page.mouse.click(5, 300);
    assert.equal(await page.evaluate(() => tri.game.state.session), session);
    await click("home-dialog-close");
    assert.equal(await page.evaluate(() => tri.game.state.session), session);
    await click("start-menu");
    await click("start-1");
    await click("begin");
    await click("begin");
    const original = await page.evaluate(() => {
      tri.game.pause();
      tri.game.home();
      tri.scene.render();
      return localStorage.getItem("tricollect.save.v1");
    });
    await click("start-menu");
    await click("start-2");
    await page.screenshot({
      path: `evidence/v016-current-confirm-${width}.png`,
    });
    assert.equal(
      await page.evaluate(() => localStorage.getItem("tricollect.save.v1")),
      original,
    );
    await click("home-dialog-close");
    assert.equal(
      await page.evaluate(() => localStorage.getItem("tricollect.save.v1")),
      original,
    );
    await click("resume");
    await click("continue");
    assert.equal(await page.evaluate(() => tri.game.state.preset), 1);
    // Actual pixels must not change when ONLY concealed identities change.
    await page.evaluate(() => {
      tri.scene.render();
    });
    const before = await page.screenshot({
      clip: { x: 0, y: 145, width, height: height - 318 },
    });
    await page.evaluate(() => {
      const ids = new Set(tri.scene.ghostPositions.map((b) => b.id));
      tri.game.board.tubes.forEach((t) =>
        t.balls.forEach((b) => {
          if (ids.has(b.id)) b.type = (b.type + 1) % 7;
        }),
      );
      tri.scene.render();
    });
    const after = await page.screenshot({
      clip: { x: 0, y: 145, width, height: height - 318 },
    });
    assert.deepEqual(after, before, "hidden identity affects visible pixels");
    reports.push({
      width,
      ...animation,
      modalNoOverwrite: true,
      hiddenPixelEquality: true,
    });
    await page.close();
  }
  await writeFile(
    "evidence/v0.1.16-home-qa.json",
    JSON.stringify(
      { platform: "Chromium actual pixels and input, not WeChat", reports },
      null,
      2,
    ),
  );
  console.log(reports);
} finally {
  await browser.close();
  server.kill();
}
