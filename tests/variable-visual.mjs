import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const server = spawn(process.execPath, ["scripts/serve.mjs"], {
  env: { ...process.env, PORT: "4178" },
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
  for (const width of [320, 390]) {
    const p = await browser.newPage({
      viewport: { width, height: width === 320 ? 660 : 844 },
    });
    await p.goto("http://127.0.0.1:4178");
    await p.waitForFunction(() => window.tri?.scene.playBackgroundLoaded);
    for (const preset of [1, 2]) {
      await p.evaluate((preset) => {
        tri.game.start(preset);
        tri.game.skipIntro();
        tri.game.begin();
      }, preset);
      for (let view = 0; view < 3; view++) {
        await p.evaluate((view) => {
          tri.game.state.view = view;
          tri.scene.render();
        }, view);
        const a = await p.evaluate(() => ({
          balls: tri.scene.ballPositions,
          ghosts: tri.scene.ghostPositions,
          targets: tri.scene.targets,
          tubes: tri.game.board.tubes,
        }));
        assert.deepEqual(
          [...new Set(a.tubes.map((t) => t.capacity))].sort(),
          [5, 6, 7],
        );
        for (const t of a.tubes) {
          assert.equal(t.balls.length, t.capacity);
          assert.ok(a.balls.filter((b) => b.tube === t.id).length <= 3);
        }
        for (const target of a.targets) {
          const t = a.tubes.find((t) => t.id === target.id),
            ball = a.balls.find((b) => b.id === t.balls.at(-1).id);
          assert.ok(ball);
          assert.equal(ball.x, target.x);
          assert.equal(ball.y, target.y);
        }
        await p.screenshot({
          path: `evidence/v016-current-${width}-preset${preset}-face${view}.png`,
        });
      }
      await p.evaluate(() => {
        tri.game.state.view = 0;
        tri.scene.render();
      });
      const before = await p.evaluate(() => ({
        points: tri.scene.ballPositions.concat(tri.scene.ghostPositions),
        target:
          tri.scene.targets.find(
            (t) =>
              tri.game.board.tubes.find((b) => b.id === t.id).capacity === 7,
          ) || tri.scene.targets[0],
      }));
      await p.mouse.click(before.target.x, before.target.y);
      await p.waitForFunction(() => tri.game.phase === "active");
      const after = await p.evaluate(() =>
        tri.scene.ballPositions.concat(tri.scene.ghostPositions),
      );
      for (const point of before.points.filter(
        (b) => b.tube === before.target.id,
      )) {
        const current = after.find((b) => b.id === point.id);
        if (current) {
          assert.equal(current.x, point.x);
          assert.equal(current.y, point.y);
          assert.equal(current.r, point.r);
        }
      }
      await p.screenshot({
        path: `evidence/v016-current-${width}-preset${preset}-after-pick.png`,
      });
      results.push({ width, preset, threeFaces: true, slotsFixed: true });
    }
    await p.evaluate(() => {
      tri.game.end();
      tri.game.home();
      tri.scene.render();
      tri.scene.buttons.find((b) => b.id === "records").act();
      tri.scene.render();
    });
    await p.screenshot({ path: `evidence/v016-current-${width}-records.png` });
    assert.equal(await p.evaluate(() => tri.game.records.entries.length), 1);
    assert.equal(
      await p.evaluate(() => tri.scene.buttons.some((b) => b.id === "start-0")),
      false,
    );
    await p.evaluate(() => {
      tri.scene.homePanel = "help";
      tri.scene.render();
    });
    await p.screenshot({ path: `evidence/v016-current-${width}-help.png` });
    await p.close();
  }
  await writeFile(
    "evidence/v0.1.16-variable-visual.json",
    JSON.stringify(
      { scope: "Chromium pixels and input, not WeChat", results },
      null,
      2,
    ),
  );
  console.log(results);
} finally {
  await browser.close();
  server.kill();
}
