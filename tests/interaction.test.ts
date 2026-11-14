import { test } from "node:test";
import assert from "node:assert/strict";
import { Controller } from "../src/controller";
import { Scene } from "../src/render/scene";
import { CONFIG, DISPLAY_NAME } from "../src/config";
function setup(preset = 0, width = 390, height = 844, scale = 1) {
  let time = 0,
    arc = false;
  const labels: string[] = [];
  const strokes: { arc: boolean; color: unknown; width: unknown }[] = [];
  const noop = () => {};
  const ctx = new Proxy(
    {
      fillText(text: string) {
        labels.push(text);
      },
      beginPath() {
        arc = false;
      },
      arc() {
        arc = true;
      },
      stroke() {
        strokes.push({
          arc,
          color: (ctx as unknown as CanvasRenderingContext2D).strokeStyle,
          width: (ctx as unknown as CanvasRenderingContext2D).lineWidth,
        });
      },
      createLinearGradient: () => ({ addColorStop: noop }),
      createRadialGradient: () => ({ addColorStop: noop }),
    },
    {
      get: (o, k) => (k in o ? o[k as keyof typeof o] : noop),
      set: (o, k, v) => {
        (o as Record<string | symbol, unknown>)[k] = v;
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  const data = new Map<string, string>();
  const game = new Controller(
    () => time,
    {
      get: (k) => data.get(k) ?? null,
      set: (k, v) => {
        data.set(k, v);
      },
    },
    { available: false, label: "none", request: async () => "failed" },
  );
  game.start(preset);
  game.skipIntro();
  game.begin();
  const scene = new Scene(ctx, game, width, height, scale);
  scene.render();
  return {
    scene,
    game,
    strokes,
    labels,
    advance: (ms: number) => {
      time += ms;
      game.tick();
      scene.render();
    },
  };
}
test("idle selectable spheres have no persistent outline; invalid sphere gives one bounded neutral pulse", () => {
  const x = setup(),
    target = x.scene.targets[0];
  assert.ok(x.scene.targets.length > 0);
  assert.ok(
    !x.strokes.some((s) => s.arc && (s.width === 2 || s.color === "#d64a2a")),
  );
  const wrong = x.scene.ballPositions.find(
    (b) => b.tube === target.id && b.slot === 3,
  )!;
  const board = JSON.stringify(x.game.board),
    remaining = x.game.state.remaining;
  x.scene.tap(wrong.x, wrong.y);
  assert.ok(x.scene.misclickFeedback);
  assert.equal(JSON.stringify(x.game.board), board);
  assert.equal(x.game.state.remaining, remaining);
  assert.ok(!("type" in x.scene.misclickFeedback));
  x.advance(CONFIG.misclickMs / 2);
  assert.ok(x.scene.misclickFeedback);
  x.advance(CONFIG.misclickMs / 2);
  assert.equal(x.scene.misclickFeedback, null);
  assert.equal(x.game.state.remaining, remaining - CONFIG.misclickMs);
  assert.equal(JSON.stringify(x.game.board), board);
});
test("background and UI taps never start feedback; valid pick and lifecycle clear transient feedback", () => {
  const x = setup();
  x.scene.tap(2, 180);
  assert.equal(x.scene.misclickFeedback, null);
  const undo = x.scene.buttons.find((b) => b.id === "undo")!;
  x.scene.tap(undo.x + 2, undo.y + 2);
  assert.equal(x.scene.misclickFeedback, null);
  const target = x.scene.targets[0],
    hidden = x.scene.ghostPositions.find((b) => b.tube === target.id)!;
  x.scene.tap(hidden.x, hidden.y);
  assert.ok(x.scene.misclickFeedback);
  assert.equal(x.game.state.history.length, 0);
  x.scene.tap(target.x, target.y);
  assert.equal(x.scene.misclickFeedback, null);
  assert.equal(x.game.state.history.length, 1);
  x.advance(240);
  x.scene.tap(hidden.x, hidden.y);
  assert.ok(x.scene.misclickFeedback);
  x.game.pause();
  x.scene.render();
  assert.equal(x.scene.misclickFeedback, null);
  x.game.begin();
  x.scene.render();
  x.scene.tap(hidden.x, hidden.y);
  assert.ok(x.scene.misclickFeedback);
  x.game.rotate(1);
  x.scene.render();
  assert.equal(x.scene.misclickFeedback, null);
  x.advance(250);
  const other = x.scene.ghostPositions.find((b) =>
    x.scene.targets.some((t) => t.id === b.tube),
  )!;
  x.scene.tap(other.x, other.y);
  assert.ok(x.scene.misclickFeedback);
  x.game.start();
  x.scene.render();
  assert.equal(x.scene.misclickFeedback, null);
});

test("confirmed display name and home effect lettering fit a narrow viewport", () => {
  assert.equal(DISPLAY_NAME, "转个“球”");
  const x = setup();
  assert.ok(!x.labels.includes(DISPLAY_NAME), "in-game title is removed");
  x.game.home();
  x.scene.width = 320;
  x.scene.height = 660;
  x.scene.render();
  assert.ok(
    !x.labels.includes("转个"),
    "custom filled glyphs replace ordinary title text",
  );
  for (const b of x.scene.buttons)
    assert.ok(b.x >= 0 && b.x + b.w <= 320 && b.y >= 0 && b.y + b.h <= 660);
});
test("play backdrop is distinct with home fallback; decorative tray never selects or pulses", () => {
  const x = setup();
  assert.equal(x.scene.backgroundKind, "fallback");
  x.scene.setBackground({ width: 600, height: 1040 } as CanvasImageSource);
  assert.equal(x.scene.backgroundKind, "home");
  x.scene.setPlayBackground({ width: 600, height: 1040 } as CanvasImageSource);
  assert.equal(x.scene.backgroundKind, "play");
  x.scene.render();
  const tray = x.scene.decorativeTray!;
  assert.equal(tray.corners.length, 3);
  const history = x.game.state.history.length;
  x.scene.tap(tray.axis.x, tray.frontY);
  assert.equal(x.game.state.history.length, history);
  assert.equal(x.scene.misclickFeedback, null);
  x.game.home();
  assert.equal(x.scene.backgroundKind, "home");
});
test("compact HUD omits seed, tube numbering and routine narration; modal controls fit narrow screens", () => {
  const x = setup();
  assert.ok(!x.labels.includes(String(x.game.state.seed)));
  assert.ok(
    !x.labels.some(
      (t) =>
        t.includes("仅正面") || t.includes("原型") || t.includes("管待清空"),
    ),
  );
  assert.ok(!x.labels.some((t) => /^\d+$/.test(t)), "no debug tube numbers");
  for (const phase of [
    "paused",
    "blocked",
    "expired",
    "ad",
    "result",
  ] as const) {
    x.game.phase = phase;
    x.scene.width = 320;
    x.scene.height = 660;
    x.scene.render();
    assert.equal(x.scene.targets.length, 0);
    for (const b of x.scene.buttons)
      assert.ok(
        b.x >= 0 && b.y >= 0 && b.x + b.w <= 320 && b.y + b.h + 8 <= 660,
      );
  }
});
test("home difficulty modal groups tiers and never overwrites resume without confirmation", () => {
  const x = setup();
  x.game.home();
  const original = x.game.resume!.session;
  for (const width of [320, 390, 500]) {
    x.scene.width = width;
    x.scene.height = 660;
    x.scene.homePanel = null;
    x.scene.render();
    assert.ok(x.scene.buttons.some((b) => b.id === "start-menu"));
    assert.ok(!x.scene.buttons.some((b) => /^start-[012]$/.test(b.id)));
    x.scene.buttons.find((b) => b.id === "start-menu")!.act();
    x.scene.render();
    const tiers = x.scene.buttons.filter((b) => /^start-[012]$/.test(b.id));
    assert.equal(tiers.length, 3);
    assert.ok(tiers.every((b) => b.x === tiers[0].x && b.w === tiers[0].w));
    tiers[2].act();
    x.scene.render();
    assert.equal(x.scene.homePanel, "replace");
    assert.equal(x.game.resume!.session, original);
    x.scene.buttons.find((b) => b.id === "home-dialog-close")!.act();
    x.scene.render();
    assert.equal(x.game.resume!.session, original);
    for (const b of x.scene.buttons)
      assert.ok(b.x >= 0 && b.x + b.w <= width && b.y + b.h + 8 <= 660);
  }
});
test("decorative motion freezes offscreen and returns without a large elapsed jump", () => {
  const x = setup();
  x.game.home();
  x.scene.render();
  x.advance(50);
  const before = x.scene.decorationTime;
  assert.ok(before > 0);
  x.scene.setForeground(false);
  x.advance(10000);
  assert.equal(x.scene.decorationTime, before);
  x.scene.setForeground(true);
  x.advance(10000);
  assert.equal(x.scene.decorationTime, before);
  x.advance(40);
  assert.equal(x.scene.decorationTime, before + 40);
});

test("transient controls retain color while input lock and real unavailable undo remain enforced", () => {
  const x = setup();
  const initial = x.scene.buttons.find((b) => b.id === "undo")!;
  assert.equal(initial.disabled, true);
  assert.equal(initial.dimmed, true);
  const top = x.scene.targets[0];
  x.scene.tap(top.x, top.y);
  x.scene.render();
  const seq = x.game.state.sequence,
    view = x.game.state.view;
  for (const id of [
    "rotate-left",
    "rotate-right",
    "undo",
    "hint",
    "lift-ball",
  ]) {
    const b = x.scene.buttons.find((b) => b.id === id)!;
    assert.equal(b.disabled, true);
    assert.equal(b.dimmed, false);
    x.scene.tap(b.x + b.w / 2, b.y + b.h / 2);
  }
  x.scene.tap(top.x, top.y);
  assert.equal(x.game.state.sequence, seq);
  assert.equal(x.game.state.view, view);
  x.advance(250);
  x.game.rotate(1);
  x.scene.render();
  const undo = x.scene.buttons.find((b) => b.id === "undo")!;
  assert.equal(undo.disabled, true);
  assert.equal(undo.dimmed, false);
  x.scene.tap(undo.x + 5, undo.y + 5);
  assert.equal(x.game.state.sequence, seq);
  x.advance(250);
  x.game.undo();
  x.scene.render();
  assert.equal(x.scene.buttons.find((b) => b.id === "undo")!.dimmed, true);
});
test("caps depend on shared-lattice front access, never on transient pick locks", () => {
  const x = setup();
  const expected = new Set(x.game.visible);
  for (const cap of x.scene.capStates)
    assert.equal(cap.closed, !expected.has(cap.id));
  const caps = structuredClone(x.scene.capStates);
  const t = x.scene.targets[0];
  x.scene.tap(t.x, t.y);
  x.scene.render();
  assert.deepEqual(x.scene.capStates, caps);
});

test("custom title uses curved glyph strokes and vertical-axis projection, never an enclosing circle", () => {
  const x = setup();
  let circles = 0,
    rotations = 0,
    fonts = 0,
    curves = 0;
  const noop = () => {};
  const ctx = new Proxy(
    {
      arc: () => circles++,
      rotate: () => rotations++,
      fillText: () => fonts++,
      quadraticCurveTo: () => curves++,
      createLinearGradient: () => ({ addColorStop: noop }),
    },
    {
      get: (o, k) => (k in o ? o[k as keyof typeof o] : noop),
      set: () => true,
    },
  ) as unknown as CanvasRenderingContext2D;
  const s = new Scene(ctx, x.game, 320, 660);
  for (const time of [0, 2322, 2600]) {
    (s as unknown as { mascotTime: number }).mascotTime = time;
    (s as unknown as { homeTitle: () => void }).homeTitle();
  }
  assert.equal(circles, 0);
  assert.equal(rotations, 0);
  assert.equal(fonts, 0);
  assert.ok(curves > 20);
});

test("new title and toy drawing restore transforms after paint exceptions", () => {
  const x = setup();
  for (const method of ["homeTitle", "trackToy"] as const) {
    for (const failAt of [1, 20, 30]) {
      let depth = 0,
        paints = 0;
      const noop = () => {};
      const paint = () => {
        if (++paints === failAt) throw Error("injected paint fault");
      };
      const ctx = new Proxy(
        {
          save: () => depth++,
          restore: () => depth--,
          stroke: paint,
          fill: paint,
          createLinearGradient: () => ({ addColorStop: noop }),
        },
        {
          get: (o, k) => (k in o ? o[k as keyof typeof o] : noop),
          set: () => true,
        },
      ) as unknown as CanvasRenderingContext2D;
      const s = new Scene(ctx, x.game, 320, 660);
      try {
        (s as unknown as Record<string, (...args: number[]) => void>)[method](
          4,
          100,
          600,
          18,
        );
      } catch (e) {
        assert.match(String(e), /injected paint fault/);
      }
      assert.equal(depth, 0, `${method} leaked a transform at paint ${failAt}`);
    }
  }
});

test("held-ball control stays above tray and visually steady through pick/turn locks without accepting input", async () => {
  const x = setup();
  const top = x.scene.targets[0];
  x.scene.tap(top.x, top.y);
  x.advance(250);
  x.game.ads = {
    available: true,
    label: "test",
    request: async () => "completed",
  };
  await x.game.liftBall();
  x.game.begin();
  x.scene.render();
  const next = x.scene.targets[0];
  x.scene.tap(next.x, next.y);
  x.scene.render();
  for (const phase of ["resolving", "rotating"]) {
    if (phase === "rotating") {
      x.advance(250);
      x.game.rotate(1);
      x.scene.render();
    }
    const b = x.scene.buttons.find((b) => b.id === "return-ball")!;
    assert.equal(b.x, 22);
    assert.ok(b.y + b.h < x.scene.height - 119 - 9);
    assert.equal(b.disabled, true);
    assert.equal(b.dimmed, false);
    const before = JSON.stringify(x.game.board),
      seq = x.game.state.sequence;
    x.scene.tap(b.x + b.w / 2, b.y + b.h / 2);
    assert.equal(JSON.stringify(x.game.board), before);
    assert.equal(x.game.state.sequence, seq);
  }
  x.advance(250);
  assert.equal(
    x.scene.buttons.find((b) => b.id === "return-ball")!.disabled,
    false,
  );
});

test("phone-sized touch halos accept near misses without stealing lower or hidden balls", () => {
  for (const preset of [0, 1, 2]) {
    const scale = 472 / 660;
    const x = setup(preset, 320 / scale, 660, scale);
    for (const t of x.scene.targets) {
      assert.ok(t.r * scale >= 22);
      assert.ok(t.r > t.visualRadius);
    }
    const target = x.scene.targets[0];
    const lower = x.scene.ballPositions.find(
      (b) => b.tube === target.id && b.y > target.y,
    )!;
    const hidden = x.scene.ghostPositions.find((b) => b.tube === target.id)!;
    for (const b of [lower, hidden]) {
      x.scene.tap(b.x, b.y);
      assert.equal(x.game.state.history.length, 0);
    }
    const near = x.scene.targets
      .flatMap((t) =>
        Array.from({ length: 24 }, (_, i) => ({
          target: t,
          x: t.x + Math.cos((i * Math.PI) / 12) * (t.visualRadius + 3),
          y: t.y + Math.sin((i * Math.PI) / 12) * (t.visualRadius + 3),
        })),
      )
      .find(
        (p) =>
          ![...x.scene.ballPositions, ...x.scene.ghostPositions].some(
            (b) => Math.hypot(p.x - b.x, p.y - b.y) <= b.r,
          ),
      );
    assert.ok(
      near,
      "there must be usable tolerance outside the painted spheres",
    );
    x.scene.tap(near.x, near.y);
    assert.equal(x.game.state.history.length, 1);
    assert.equal(
      x.game.state.history[0].tubes.find((t) => t.id === near.target.id)!.balls
        .length - 1,
      x.game.board.tubes.find((t) => t.id === near.target.id)!.balls.length,
    );
    x.scene.tap(near.x, near.y);
    assert.equal(x.game.state.history.length, 1, "repeat tap stays locked");
  }
});

test("overlapping touch halos choose the nearest legal top rather than paint order", () => {
  for (const reverse of [false, true]) {
    const x = setup();
    const [a, b] = x.scene.targets;
    x.scene.targets = [
      { ...a, x: 40, y: 250, r: 26, visualRadius: 8 },
      { ...b, x: 80, y: 250, r: 26, visualRadius: 8 },
    ];
    if (reverse) x.scene.targets.reverse();
    x.scene.ballPositions = [];
    x.scene.ghostPositions = [];
    const before = x.game.board.tubes.find((t) => t.id === b.id)!.balls.length;
    x.scene.tap(62, 260);
    assert.equal(
      x.game.board.tubes.find((t) => t.id === b.id)!.balls.length,
      before - 1,
    );
  }
});

test("glass artwork retains targets and never reveals hidden-ball colors", () => {
  const x = setup(2);
  const targets = x.scene.targets.map((t) => ({ ...t }));
  const positions = x.scene.ballPositions.map((t) => ({ ...t }));
  x.scene.setTubeGlass({
    width: 166,
    height: 768,
  } as unknown as CanvasImageSource);
  x.scene.render();
  assert.deepEqual(x.scene.targets, targets);
  assert.deepEqual(x.scene.ballPositions, positions);
  const visible = new Set(x.scene.visibleBalls.flatMap((t) => t.ids));
  assert.ok(x.scene.ghostPositions.length > 0);
  for (const hidden of x.scene.ghostPositions)
    assert.ok(!visible.has(hidden.id));
});

test("dynamic vessel shrinks only after transfer while all remaining fixed slots stay put", () => {
  const x = setup(2);
  const target = x.scene.targets[0];
  const id = target.id;
  const top = () => x.scene.capStates.find((c) => c.id === id)!.y;
  const positions = () =>
    [...x.scene.ballPositions, ...x.scene.ghostPositions].filter(
      (b) => b.tube === id,
    );
  const before = positions();
  const oldTop = top();
  const step = before[0].r * 1.94;
  x.game.pick(id);
  x.scene.render();
  assert.equal(x.game.phase, "resolving");
  assert.equal(top(), oldTop);
  for (const p of positions())
    assert.deepEqual(
      p,
      before.find((b) => b.id === p.id),
    );
  x.advance(250);
  assert.ok(Math.abs(top() - oldTop - step) < 1e-8);
  for (const p of positions())
    assert.deepEqual(
      p,
      before.find((b) => b.id === p.id),
    );
  x.game.undo();
  x.scene.render();
  assert.equal(top(), oldTop);
  assert.deepEqual(positions(), before);
});
test("inner-wall sticker front arc stays below the lowest visible sphere", () => {
  const x = setup(2);
  for (let pick = 0; pick < 3; pick++) {
    for (const surface of x.scene.hiddenSurfaces) {
      const visible = x.scene.ballPositions.filter(
        (b) => b.tube === surface.id,
      );
      if (!visible.length) continue;
      const lowest = visible.reduce((a, b) => (a.y > b.y ? a : b));
      assert.ok(surface.top >= lowest.y + lowest.r - 1e-8);
      assert.ok(surface.ry > 0 && surface.rx > surface.ry);
      assert.ok(Math.abs(surface.center - surface.top) < 1e-8);
      assert.ok(surface.center + surface.ry < surface.bottom);
      // Only the front half-ellipse forms the sticker edge; no solid top disk.
      for (let i = 0; i < 64; i++)
        assert.ok(
          surface.center + surface.ry * Math.sin((i * Math.PI) / 64) >=
            lowest.y + lowest.r - 1e-8,
        );
    }
    x.game.pick(x.scene.targets[0].id);
    x.advance(250);
  }
});

test("last-ball vessel persists through flight without target then disappears and undo restores it", () => {
  const x = setup(0);
  const id = x.scene.targets[0].id;
  const tube = () => x.game.board.tubes.find((t) => t.id === id)!;
  while (tube().balls.length > 1) {
    x.game.pick(id);
    x.advance(250);
  }
  const cap = { ...x.scene.capStates.find((t) => t.id === id)! };
  const target = { ...x.scene.targets.find((t) => t.id === id)! };
  x.game.pick(id);
  x.scene.render();
  assert.equal(tube().balls.length, 0);
  assert.equal(x.game.phase, "resolving");
  assert.ok(x.scene.tubeLayout.some((t) => t.id === id));
  assert.equal(x.scene.capStates.find((t) => t.id === id)!.y, cap.y);
  assert.ok(!x.scene.targets.some((t) => t.id === id));
  assert.ok((x.scene as any).bodies.some((t: any) => t.id === id));
  assert.equal(x.scene.flightOrigin!.x, target.x);
  assert.equal(x.scene.flightOrigin!.y, target.y);
  x.advance(120);
  assert.ok(x.scene.tubeLayout.some((t) => t.id === id));
  x.advance(130);
  assert.ok(!x.scene.tubeLayout.some((t) => t.id === id));
  assert.ok(!(x.scene as any).bodies.some((t: any) => t.id === id));
  x.game.undo();
  x.scene.render();
  assert.equal(tube().balls.length, 1);
  assert.equal(x.scene.capStates.find((t) => t.id === id)!.y, cap.y);
  assert.deepEqual(
    x.scene.targets.find((t) => t.id === id),
    target,
  );
});
