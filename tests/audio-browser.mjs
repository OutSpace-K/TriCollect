import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const server = spawn(process.execPath, ["scripts/serve.mjs"], {
  env: { ...process.env, PORT: "4175" },
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
await page.addInitScript(() => {
  window.players = [];
  const Original = window.Audio;
  window.Audio = function (src) {
    const a = new Original(src);
    players.push(a);
    return a;
  };
});
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
try {
  await page.goto("http://127.0.0.1:4175");
  await page.waitForFunction(() => window.tri);
  assert.equal(await page.evaluate(() => players.length), 0);
  await click("start-0");
  await page.waitForFunction(() => players[0]?.currentTime > 0.05);
  const metadata = await page.evaluate(() => ({
    duration: players[0].duration,
    volume: players[0].volume,
    loop: players[0].loop,
  }));
  assert.equal(metadata.duration, 32);
  assert.equal(metadata.loop, true);
  await page.evaluate(() => {
    players[0].currentTime = 31.8;
  });
  await page.waitForTimeout(650);
  assert.ok(
    await page.evaluate(() => players[0].currentTime < 2 && !players[0].paused),
  );
  await page.waitForFunction(() => tri.game.phase === "ready");
  await click("begin");
  await click("pause");
  assert.ok(await page.evaluate(() => players[0].paused));
  await click("continue");
  assert.ok(await page.evaluate(() => !players[0].paused));
  await click("sound-toggle");
  assert.ok(await page.evaluate(() => players[0].paused));
  await page.reload();
  await page.waitForFunction(() => window.tri);
  assert.equal(await page.evaluate(() => tri.game.state.sound), false);
  await click("start-0");
  assert.equal(await page.evaluate(() => players.length), 0);
  await click("sound-toggle");
  await page.waitForFunction(() => players[0]?.currentTime > 0.05);
  for (let i = 0; i < 3; i++) {
    await page.waitForFunction(() => tri.game.phase === "ready");
    await click("begin");
    await click("pause");
    await click("home");
    assert.ok(await page.evaluate(() => players[0].paused));
    await click("start-0");
  }
  assert.equal(await page.evaluate(() => players.length), 1);
  await page.waitForFunction(() => tri.game.phase === "ready");
  await click("begin");
  await page.evaluate(() => {
    tri.game.state.remaining = 0;
    tri.game.tick();
    window.confirm = () => {
      if (!players[0].paused) throw Error("music played during mock ad");
      return false;
    };
  });
  await click("extend");
  assert.ok(await page.evaluate(() => players[0].paused));
  await writeFile(
    "evidence/v0.1.10-audio-browser.json",
    JSON.stringify(
      {
        passed: true,
        scope:
          "Real HTMLAudioElement decoding/playback in headless Chromium; no human listening or WeChat device",
        metadata,
        checks: [
          "no autoplay before gesture",
          "32s loop wraps",
          "pause and resume",
          "mute preference after reload",
          "single reusable player over repeated rounds",
          "mock ad stays quiet",
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    "Browser actual audio decode/playback/lifecycle passed; human listening not performed.",
  );
} finally {
  await browser.close();
  server.kill();
}
