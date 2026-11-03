import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const server = spawn(process.execPath, ["scripts/serve.mjs"], {
  env: { ...process.env, PORT: "4184" },
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
    await p.goto("http://127.0.0.1:4184");
    await p.waitForFunction(() => window.tri?.scene.playBackgroundLoaded);
    await p.evaluate(() => {
      window.t = 0;
      tri.scene.mascotTime = 0;
      tri.game.now = () => window.t;
      tri.scene.setForeground(true);
      tri.scene.render();
    });
    await p.screenshot({
      path: `evidence/v018-current-title-${width}-rest.png`,
    });
    const scale = Math.min(1.05, (width - 40) / 272),
      left = width / 2 - 128 * scale;
    const first = await p.screenshot({
      clip: { x: left - 6, y: 79, width: 88 * scale, height: 90 },
    });
    await p.evaluate(() => {
      for (let i = 0; i < 52; i++) {
        window.t += 50;
        tri.scene.render();
      }
    });
    assert.ok(
      Math.abs((await p.evaluate(() => tri.scene.titleAngle)) - Math.PI) <
        0.001,
    );
    await p.screenshot({
      path: `evidence/v018-current-title-${width}-half-turn.png`,
    });
    const firstAfter = await p.screenshot({
      clip: { x: left - 6, y: 79, width: 88 * scale, height: 90 },
    });
    assert.deepEqual(firstAfter, first, "only middle glyph rotates");
    // Quarter-yaw: the middle glyph becomes edge-on, never a planar rotated arrow.
    await p.evaluate(() => {
      tri.scene.mascotTime = 1800 + 1600 * 0.3263518223;
      tri.scene.render();
    });
    assert.ok(
      Math.abs(Math.cos(await p.evaluate(() => tri.scene.titleAngle))) < 0.001,
    );
    await p.screenshot({
      path: `evidence/v018-current-title-${width}-edge.png`,
    });
    const track = await p.evaluate(() => tri.scene.trackObjects);
    assert.ok(new Set(track.map((t) => t.y)).size >= 3);
    assert.ok(new Set(track.map((t) => t.r)).size >= 3);
    const moved = await p.evaluate(() => {
      window.t += 32;
      tri.scene.render();
      return tri.scene.trackObjects;
    });
    const speeds = moved.map((p, i) =>
      Number(
        (
          (((p.x - track[i].x + (width + 140) * 1.5) % (width + 140)) -
            (width + 140) / 2) /
          32
        ).toFixed(3),
      ),
    );
    assert.equal(new Set(speeds).size, 5);
    assert.ok(speeds.every((v) => Math.abs(v) > 0 && Math.abs(v) < 0.06));

    assert.ok(speeds.some((v) => v < 0) && speeds.some((v) => v > 0));
    assert.ok(
      Math.max(...track.map((t) => t.y)) - Math.min(...track.map((t) => t.y)) >=
        70,
    );
    for (const pose of [0, 4000, 11000, 22000, 32000]) {
      await p.evaluate((time) => {
        tri.scene.mascotTime = time;
        tri.scene.render();
      }, pose);
      await p.screenshot({
        path: `evidence/v018-current-track-${width}-${pose}.png`,
      });
    }
    await p.evaluate(() => {
      tri.game.start(1);
      tri.game.skipIntro();
      tri.game.begin();
      tri.scene.render();
    });
    for (let view = 0; view < 3; view++) {
      const report = await p.evaluate((v) => {
        tri.game.state.view = v;
        tri.scene.render();
        const open = [...tri.game.visible];
        return { caps: tri.scene.capStates, open };
      }, view);
      for (const c of report.caps)
        assert.equal(c.closed, !report.open.includes(c.id));
      await p.screenshot({
        path: `evidence/v018-current-caps-${width}-face${view}.png`,
      });
    }
    // First pick arms undo; second pick must preserve the entire control-strip pixels.
    await p.evaluate(() => {
      const s = tri.scene,
        t = s.targets[0];
      s.tap(t.x, t.y);
      window.t += 250;
      tri.game.tick();
      s.render();
    });
    const control = { x: 16, y: height - 92, width: width - 32, height: 58 };
    const before = await p.screenshot({ clip: control });
    const caps = await p.evaluate(() => tri.scene.capStates);
    const locked = await p.evaluate(() => {
      const s = tri.scene,
        g = tri.game,
        t = s.targets[0];
      s.tap(t.x, t.y);
      s.render();
      const seq = g.state.sequence,
        view = g.state.view;
      const b = s.buttons.filter((b) =>
        ["rotate-left", "rotate-right", "undo", "hint"].includes(b.id),
      );
      for (const x of b) s.tap(x.x + x.w / 2, x.y + x.h / 2);
      s.tap(t.x, t.y);
      return {
        buttons: b.map(({ id, disabled, dimmed }) => ({
          id,
          disabled,
          dimmed,
        })),
        seq,
        afterSeq: g.state.sequence,
        view,
        afterView: g.state.view,
        caps: s.capStates,
      };
    });
    assert.ok(locked.buttons.every((b) => b.disabled && !b.dimmed));
    assert.equal(locked.seq, locked.afterSeq);
    assert.equal(locked.view, locked.afterView);
    assert.deepEqual(locked.caps, caps);
    const during = await p.screenshot({ clip: control });
    assert.deepEqual(during, before, "control strip flashes on transient lock");
    await p.screenshot({ path: `evidence/v018-current-pick-${width}.png` });
    await p.evaluate(() => {
      window.t += 250;
      tri.game.tick();
      tri.game.rotate(1);
      window.t += 125;
      tri.game.tick();
      tri.scene.render();
    });
    const mid = await p.evaluate(() => ({
      caps: tri.scene.capStates,
      targets: tri.scene.targets.length,
      view: tri.game.presentationView,
      open: [...tri.game.visible],
    }));
    assert.equal(mid.targets, 0);
    assert.ok(
      mid.caps.some((c) => !c.closed),
      "rotation must not close every cap due to input lock",
    );
    await p.screenshot({ path: `evidence/v018-current-rotation-${width}.png` });
    // Isolated geometry reveal, not a generated-win claim.
    const reveal = await p.evaluate(() => {
      const g = tri.game;
      g.start();
      g.skipIntro();
      g.begin();
      g.state.view = 0;
      const before = tri.scene;
      g.board.tubes.find((t) => t.id === "1,0").balls = [];
      g.board.tubes.find((t) => t.id === "2,0").balls = [];
      tri.scene.render();
      return { visible: [...g.visible], caps: tri.scene.capStates };
    });
    assert.ok(reveal.visible.includes("1,1"));
    assert.equal(reveal.caps.find((c) => c.id === "1,1").closed, false);
    await p.screenshot({ path: `evidence/v018-current-reveal-${width}.png` });
    reports.push({
      width,
      verticalAxisFlip: true,
      threeTrackLanes: true,
      distinctToySpeeds: speeds,
      differentToySizes: true,
      capsThreeFaces: true,
      noTransientGray: true,
      inputLockPreserved: true,
      revealedCapOpens: true,
    });
    await p.close();
  }
  await writeFile(
    "evidence/v0.1.18-ui.json",
    JSON.stringify(
      { platform: "Actual Chromium pixels/input, not WeChat", reports },
      null,
      2,
    ),
  );
  console.log(reports);
} finally {
  await browser.close();
  server.kill();
}
