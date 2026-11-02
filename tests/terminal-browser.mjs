import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const server = spawn(process.execPath, ["scripts/serve.mjs"], {
  env: { ...process.env, PORT: "4179" },
  stdio: "pipe",
});
await new Promise((r) => server.stdout.once("data", r));
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
const results = [];
try {
  for (const failures of [
    ["tricollect.save.v1"],
    ["tricollect.records.v1"],
    ["tricollect.save.v1", "tricollect.records.v1"],
  ]) {
    const page = await browser.newPage({
      viewport: { width: 320, height: 660 },
    });
    await page.goto("http://127.0.0.1:4179");
    await page.waitForFunction(() => window.tri);
    const before = await page.evaluate((failures) => {
      const g = tri.game;
      g.start();
      g.skipIntro();
      g.begin();
      const session = g.state.session,
        original = g.store.set;
      g.store.set = (k, v) => {
        if (failures.includes(k)) throw Error("injected write failure");
        original(k, v);
      };
      g.end();
      tri.scene.render();
      return {
        session,
        phase: g.phase,
        journal: !!localStorage.getItem("tricollect.terminal.v1"),
        message: g.message,
        records: g.records.entries.length,
      };
    }, failures);
    assert.equal(before.phase, "result");
    assert.equal(before.journal, true);
    assert.match(before.message, /保存失败/);
    await page.screenshot({
      path: `evidence/v017-current-storage-${results.length}.png`,
    });
    for (let i = 0; i < 3; i++) {
      await page.reload();
      await page.waitForFunction(() => window.tri);
      const after = await page.evaluate(() => ({
        resume: tri.game.resume,
        entries: tri.game.records.entries,
        journal: localStorage.getItem("tricollect.terminal.v1"),
      }));
      assert.equal(after.resume, null);
      assert.equal(after.entries.length, 1);
      assert.equal(after.entries[0].session, before.session);
      assert.equal(after.entries[0].outcome, "lost");
      assert.equal(after.journal, "");
    }
    results.push({ failures, restarts: 3, recordCount: 1, resumable: false });
    await page.close();
  }
  await writeFile(
    "evidence/v0.1.17-terminal-browser.json",
    JSON.stringify(
      { platform: "Actual browser bundle in Chromium, not WeChat", results },
      null,
      2,
    ),
  );
  console.log(results);
} finally {
  await browser.close();
  server.kill();
}
