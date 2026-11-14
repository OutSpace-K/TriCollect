import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const server = spawn(process.execPath, ["scripts/serve.mjs"], {
  env: { ...process.env, PORT: "4177" },
  stdio: "pipe",
});
await new Promise((r) => server.stdout.once("data", r));
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
  headless: true,
});
const source = await readFile("dist/wechat/game.js", "utf8"),
  reports = [];
try {
  for (const [width, height] of [
    [320, 568],
    [320, 660],
    [390, 844],
  ]) {
    const p = await browser.newPage({ viewport: { width, height } });
    await p.route("**/native", (r) =>
      r.fulfill({
        contentType: "text/html",
        body: '<html><head><meta charset="utf-8"></head><body style="margin:0;background:#18234f"><canvas id="game" style="width:100vw;height:100vh"></canvas><div style="position:fixed;right:10px;top:32px;width:90px;height:32px;border-radius:20px;background:#ffffff66;text-align:center;color:#fff">•••　◉</div></body></html>',
      }),
    );
    await p.goto("http://127.0.0.1:4177/native");
    await p.evaluate(() => {
      const canvas = document.querySelector("canvas"),
        ctx = canvas.getContext("2d");
      window.labels = [];
      const original = ctx.fillText.bind(ctx),
        clear = ctx.clearRect.bind(ctx);
      ctx.fillText = (s, x, y) => {
        const m = ctx.getTransform(),
          pt = new DOMPoint(x, y - 5).matrixTransform(m);
        window.labels.push({ s, x: pt.x / 2, y: pt.y / 2 });
        original(s, x, y);
      };
      ctx.clearRect = (...a) => {
        window.labels = [];
        clear(...a);
      };
      const storage = new Map();
      window.nativeStorage = storage;
      window.handlers = {};
      window.wx = {
        createCanvas: () => canvas,
        getWindowInfo: () => ({
          windowWidth: innerWidth,
          windowHeight: innerHeight,
          pixelRatio: 2,
          safeArea: { top: 24, bottom: innerHeight - 24 },
        }),
        getMenuButtonBoundingClientRect: () => ({ top: 32, bottom: 64 }),
        getPerformance: () => ({ now: () => performance.now() * 1000 }),
        createImage: () => new Image(),
        getStorageSync: (k) => storage.get(k),
        setStorageSync: (k, v) => storage.set(k, v),
        createInnerAudioContext: () => ({
          play() {},
          stop() {},
          pause() {},
          onError() {},
        }),
        onTouchStart: (f) => (handlers.start = f),
        onTouchEnd: (f) => (handlers.end = f),
        onTouchCancel: (f) => (handlers.cancel = f),
        onHide: (f) => (handlers.hide = f),
        onShow: (f) => (handlers.show = f),
      };
      canvas.addEventListener("pointerdown", (e) =>
        handlers.start?.({
          touches: [{ clientX: e.clientX, clientY: e.clientY }],
        }),
      );
      canvas.addEventListener("pointerup", (e) =>
        handlers.end?.({
          changedTouches: [{ clientX: e.clientX, clientY: e.clientY }],
        }),
      );
    });
    await p.addScriptTag({ content: source });
    await p.waitForFunction(() => labels.some((l) => l.s === "开始游戏"));
    async function click(s) {
      const l = await p.evaluate((s) => labels.find((l) => l.s === s), s);
      assert.ok(l, s);
      await p.mouse.click(l.x, l.y);
      await p.waitForTimeout(40);
    }
    await p.screenshot({
      path: `evidence/v024-current-native-${width}x${height}-home.png`,
    });
    // Exercise exits with real touch dispatch, including all 30 stored records.
    for (const count of [0, 30]) {
      await p.evaluate(
        (count) =>
          nativeStorage.set(
            "tricollect.records.v1",
            JSON.stringify({
              schema: 1,
              entries: Array.from({ length: count }, (_, i) => ({
                session: `native-${i}`,
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
        count,
      );
      for (const dy of [-16, 16]) {
        await click("战绩");
        const back = await p.evaluate(() => labels.find((l) => l.s === "返回"));
        assert.ok(
          back.y > height / 2 && back.y < height - 70,
          "records exit stays below content with bottom clearance",
        );
        await p.screenshot({
          path: `evidence/v024-native-records-${width}x${height}-${count}.png`,
        });
        await p.mouse.click(back.x, back.y + dy);
        await p.waitForTimeout(40);
        assert.ok(
          await p.evaluate(() => labels.some((l) => l.s === "开始游戏")),
          "exit edge touch hit",
        );
      }
    }
    await click("开始游戏");
    await click("简单");
    await click("跳过开场");
    await click("开始 · 02:00");
    await p.waitForTimeout(60);
    const buttons = await p.evaluate(() =>
      labels.filter((l) =>
        ["声音开", "暂停", "←", "→", "撤销", "提示"].includes(l.s),
      ),
    );
    assert.equal(buttons.length, 6);
    for (const b of buttons)
      assert.ok(b.y > 64 && b.y < height - 24, JSON.stringify(b));
    await p.screenshot({
      path: `evidence/v024-current-native-${width}x${height}-active.png`,
    });
    await click("寄存");
    assert.ok(
      await p.evaluate(() => labels.some((l) => l.s.includes("广告暂不可用"))),
    );
    await p.screenshot({
      path: `evidence/v024-current-native-${width}x${height}-tool.png`,
    });
    await click("知道了");
    await click("暂停");
    await p.screenshot({
      path: `evidence/v024-current-native-${width}x${height}-pause.png`,
    });
    await click("继续游戏");
    await click("→");
    await p.waitForTimeout(300);
    reports.push({
      width,
      height,
      capsuleBottom: 64,
      buttons,
      actualWeChat: false,
    });
    await p.close();
  }
  await writeFile(
    "evidence/v0.1.24-native-canvas.json",
    JSON.stringify(
      {
        platform:
          "Chromium Canvas executing actual WeChat bundle with wx bridge, NOT WeChat Developer Tools",
        reports,
      },
      null,
      2,
    ),
  );
  console.log(
    "Native bundle actual pixels at 320/390: capsule clearance, start/pause/resume/turn passed",
  );
} finally {
  await browser.close();
  server.kill();
}
