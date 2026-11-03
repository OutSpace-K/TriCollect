import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const server = spawn(process.execPath, ["scripts/serve.mjs"], {
  env: { ...process.env, PORT: "4189" },
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
    [320, 660],
    [390, 844],
  ]) {
    const p = await browser.newPage({ viewport: { width, height } }),
      errors = [];
    p.on("pageerror", (e) => errors.push(String(e)));
    await p.goto("http://127.0.0.1:4189");
    await p.waitForFunction(() => tri?.scene.playBackgroundLoaded);
    const click = async (id) => {
      await p.waitForFunction(
        (id) => tri.scene.buttons.some((b) => b.id === id && !b.disabled),
        id,
      );
      const b = await p.evaluate((id) => {
        const b = tri.scene.buttons.find((b) => b.id === id),
          r = document.querySelector("canvas").getBoundingClientRect();
        return {
          x: r.left + ((b.x + b.w / 2) * r.width) / tri.scene.width,
          y: r.top + ((b.y + b.h / 2) * r.height) / tri.scene.height,
        };
      }, id);
      await p.mouse.click(b.x, b.y);
      await p.waitForTimeout(30);
    };
    const pages = [];
    const audit = async (name, screenshot = true) => {
      const s = await p.evaluate(() => {
        tri.scene.render();
        const c = document.querySelector("canvas").getBoundingClientRect();
        return {
          buttons: tri.scene.buttons.map(({ id, x, y, w, h }) => ({
            id,
            x,
            y,
            w,
            h,
          })),
          w: tri.scene.width,
          h: tri.scene.height,
          canvas: { x: c.x, y: c.y, w: c.width, h: c.height },
        };
      });
      assert.ok(
        s.canvas.y + s.canvas.h <= height + 0.1,
        `${name} clipped canvas`,
      );
      for (const b of s.buttons) {
        assert.ok(
          b.x >= 0 &&
            b.y >= 0 &&
            b.x + b.w <= s.w + 0.1 &&
            b.y + b.h <= s.h + 0.1,
          `${name} ${b.id} bounds`,
        );
        assert.ok(b.h >= 52, `${name} ${b.id} target`);
        if (["home-dialog-close", "tool-close", "home"].includes(b.id)) {
          assert.ok(
            (b.h * s.canvas.h) / s.h >= 44,
            `${name} physical exit target`,
          );
          assert.ok(
            ((s.h - b.y - b.h) * s.canvas.h) / s.h >= 32,
            `${name} exit bottom breathing room`,
          );
        }
      }
      for (let i = 0; i < s.buttons.length; i++)
        for (let j = i + 1; j < s.buttons.length; j++) {
          const a = s.buttons[i],
            b = s.buttons[j];
          assert.ok(
            !(
              a.x < b.x + b.w &&
              a.x + a.w > b.x &&
              a.y < b.y + b.h &&
              a.y + a.h > b.y
            ),
            `${name}: overlap ${a.id}/${b.id}`,
          );
        }
      pages.push(name);
      if (screenshot)
        await p.screenshot({
          path: `evidence/v024-layout-${width}x${height}-${name}.png`,
        });
    };
    await audit("home");
    assert.equal(
      await p.evaluate(
        () => tri.scene.buttons.find((b) => b.id === "start-menu").y,
      ),
      Math.min(Math.max(height, 660) - 230, 435) + 16,
    );
    for (const time of [1800, 2322, 2600, 2878, 3400]) {
      await p.evaluate((time) => {
        tri.scene.setForeground(false);
        tri.scene.mascotTime = time;
        tri.scene.render();
      }, time);
      await p.screenshot({
        path: `evidence/v024-title-${width}x${height}-${time}.png`,
      });
    }
    await p.evaluate(() => tri.scene.setForeground(true));
    await click("start-menu");
    await audit("difficulty");
    const back = await p.evaluate(
      () => tri.scene.buttons.find((b) => b.id === "home-dialog-close").y,
    );
    assert.equal(
      back,
      await p.evaluate(() => Math.min(tri.scene.height - 128, 460)),
    );
    await click("home-dialog-close");
    await click("help");
    for (let i = 0; i < 3; i++) {
      await audit(`help-${i}`);
      await click("guide-next");
    }
    await click("help");
    await click("home-dialog-close");
    assert.equal(await p.evaluate(() => tri.scene.homePanel), null);
    await click("records");
    await audit("records-empty");
    assert.equal(
      await p.evaluate(
        () => tri.scene.buttons.find((b) => b.id === "home-dialog-close").y,
      ),
      await p.evaluate(() => tri.scene.height - 140),
    );
    await click("home-dialog-close");
    // Synthetic record rows exercise pagination layout, not real achievements.
    await p.evaluate(() =>
      localStorage.setItem(
        "tricollect.records.v1",
        JSON.stringify({
          schema: 1,
          entries: Array.from({ length: 30 }, (_, i) => ({
            session: `layout-${i}`,
            endedAt: Date.now(),
            preset: 0,
            difficulty: "简单",
            outcome: "lost",
            score: 0,
            cleared: 0,
            total: 105,
            elapsedMs: 1000,
            addedMs: 0,
          })),
        }),
      ),
    );
    await click("records");
    await audit("records-filled");
    await click("records-next");
    await audit("records-next");
    await click("records-prev");
    for (let page = 1; page < 8; page++) await click("records-next");
    await audit("records-last");
    assert.equal(await p.evaluate(() => tri.scene.recordPage), 7);
    assert.ok(
      await p.evaluate(
        () => tri.scene.buttons.find((b) => b.id === "records-next").disabled,
      ),
    );
    await click("home-dialog-close");
    await click("start-menu");
    await click("start-0");
    await p.waitForFunction(() => tri.game.phase === "ready");
    await audit("ready");
    await click("begin");
    await audit("active");
    const tool = await p.evaluate(() =>
      tri.scene.buttons.find((b) => b.id === "lift-ball"),
    );
    assert.equal(tool.x, 22);
    assert.ok(tool.y + tool.h < Math.max(height, 660) - 119 - 9);
    await click("lift-ball");
    await audit("tool-empty");
    await click("tool-close");
    await p.evaluate(() => {
      const g = tri.game,
        l = tri.createLevel(g.state.preset, g.state.seed);
      g.state.view = l.views[0];
      g.pick(l.witness[0]);
    });
    await p.waitForFunction(() => tri.game.phase === "active");
    const before = await p.evaluate(() => JSON.stringify(tri.game.board));
    await click("lift-ball");
    await audit("tool-confirm");
    const remaining = await p.evaluate(() => tri.game.state.remaining);
    await p.waitForTimeout(150);
    assert.equal(await p.evaluate(() => tri.game.state.remaining), remaining);
    await click("tool-close");
    assert.equal(
      await p.evaluate(() => JSON.stringify(tri.game.board)),
      before,
    );
    await p.evaluate(() => {
      tri.game.ads = {
        available: false,
        label: "广告未配置",
        request: async () => {
          throw Error("must not request");
        },
      };
    });
    await audit("unavailable-icon");
    await click("lift-ball");
    await audit("tool-unavailable");
    assert.equal(
      await p.evaluate(() =>
        tri.scene.buttons.some((b) => b.id === "tool-confirm"),
      ),
      false,
    );
    await click("tool-close");
    assert.equal(await p.evaluate(() => tri.game.state.rewards.length), 0);
    await click("pause");
    await audit("paused");
    await click("home");
    await audit("home-resume");
    const saved = await p.evaluate(() => JSON.stringify(localStorage));
    await click("start-menu");
    await click("start-2");
    await audit("replace");
    await click("home-dialog-close");
    assert.equal(await p.evaluate(() => JSON.stringify(localStorage)), saved);
    await click("resume");
    await click("continue");
    // Layout-only terminal fixtures; real victories are separately proved by E2E.
    for (const phase of ["blocked", "expired", "ad", "result"]) {
      await p.evaluate((phase) => {
        tri.game.phase = phase;
        tri.scene.render();
      }, phase);
      await audit(phase);
      if (phase !== "ad") {
        await click("home");
        assert.equal(await p.evaluate(() => tri.game.phase), "home");
      }
    }
    await p.evaluate(() => {
      tri.game.phase = "result";
      tri.game.board.status = "won";
      tri.scene.render();
    });
    await audit("won");
    // This intentionally incomplete victory fixture is not persistable; real
    // victory return/home behavior is exercised by e2e.mjs after solving.
    assert.deepEqual(errors, []);
    reports.push({
      width,
      height,
      pages,
      actualClicks: true,
      terminalFixtures: "layout only",
      errors,
    });
    await p.close();
  }
  await writeFile(
    "evidence/v0.1.24-layout.json",
    JSON.stringify({ reports }, null, 2),
  );
  console.log(reports);
} finally {
  await browser.close();
  server.kill();
}
