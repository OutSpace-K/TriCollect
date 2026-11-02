import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const server = spawn(process.execPath, ["scripts/serve.mjs"], {
  env: { ...process.env, PORT: "4176" },
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
  for (const width of [390, 320]) {
    const height = width === 320 ? 660 : 844;
    const p = await browser.newPage({ viewport: { width, height } });
    await p.goto("http://127.0.0.1:4176");
    await p.waitForFunction(() => window.tri && tri.scene.playBackgroundLoaded);
    for (const mode of [
      "home",
      "ready",
      "active",
      "paused",
      "blocked",
      "expired",
      "ad",
      "won",
      "lost",
    ]) {
      await p.evaluate((mode) => {
        const g = tri.game;
        g.start();
        g.skipIntro();
        if (mode === "home") g.home();
        else if (mode === "won" || mode === "lost") {
          g.phase = "result";
          g.board.status = mode === "won" ? "won" : "active";
          g.board.score = mode === "won" ? 4420 : 0;
          if (mode === "won") {
            g.board.cleared = g.board.tubes.flatMap((t) => t.balls);
            g.board.tubes.forEach((t) => (t.balls = []));
          }
        } else {
          g.phase = mode;
          if (mode === "expired") g.state.remaining = 0;
        }
        tri.scene.render();
      }, mode);
      await p.waitForTimeout(35);
      const report = await p.evaluate(() => ({
        buttons: tri.scene.buttons.map(({ id, x, y, w, h }) => ({
          id,
          x,
          y,
          w,
          h,
        })),
        targets: tri.scene.targets.length,
      }));
      for (const b of report.buttons)
        assert.ok(
          b.x >= 0 && b.y >= 0 && b.x + b.w <= width && b.y + b.h + 8 <= height,
          JSON.stringify({ mode, width, b }),
        );
      if (["paused", "blocked", "expired", "ad", "won", "lost"].includes(mode))
        assert.equal(report.targets, 0);
      await p.screenshot({ path: `evidence/v013-${width}-${mode}.png` });
      reports.push({ mode, width, ...report });
    }
    await p.close();
  }
  await writeFile(
    "evidence/v0.1.13-screens.json",
    JSON.stringify(
      {
        platform:
          "Chromium only; visual states injected for layout, not completion proof",
        reports,
      },
      null,
      2,
    ),
  );
  console.log(
    "18 actual browser screen captures; all button bounds and modal target exclusions passed",
  );
} finally {
  await browser.close();
  server.kill();
}
