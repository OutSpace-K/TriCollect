import { test } from "node:test";
import assert from "node:assert/strict";
import { Music } from "../src/platform/music";
test("home attempts autoplay, reuses one player, pauses for every inactive lifecycle", () => {
  let created = 0,
    plays = 0,
    pauses = 0;
  const music = new Music(() => {
    created++;
    return {
      play: () => {
        plays++;
      },
      pause: () => {
        pauses++;
      },
    };
  });
  music.update(true, "home");
  assert.equal(created, 1);
  music.gesture(true, "intro");
  for (let i = 0; i < 100; i++) music.update(true, "active");
  assert.equal(plays, 1);
  for (const phase of ["paused", "ad", "expired", "blocked", "result"]) {
    music.update(true, phase);
    music.update(true, phase);
    music.gesture(true, "active");
  }
  assert.equal(pauses, 5);
  assert.equal(created, 1);
  assert.equal(plays, 6);
  music.suspend();
  music.update(false, "active");
  assert.equal(plays, 6);
  music.gesture(true, "active");
  assert.equal(plays, 7);
});
test("music failures and async errors never escape or retry every frame", async () => {
  for (const create of [
    () => {
      throw Error("create");
    },
    () => ({
      play: () => {
        throw Error("play");
      },
      pause: () => {
        throw Error("pause");
      },
    }),
    () => ({ play: () => Promise.reject(Error("async")), pause: () => {} }),
  ]) {
    const music = new Music(create);
    assert.doesNotThrow(() => music.gesture(true, "active"));
    await Promise.resolve();
    assert.doesNotThrow(() => music.update(true, "active"));
  }
});
test("a cancelled pending play does not poison a subsequent unmute", async () => {
  let reject: (reason: unknown) => void = () => {},
    plays = 0;
  const music = new Music(() => ({
    play: () => {
      plays++;
      return plays === 1
        ? new Promise((_, r) => {
            reject = r;
          })
        : Promise.resolve();
    },
    pause: () => {},
  }));
  music.gesture(true, "active");
  music.update(false, "active");
  music.gesture(true, "active");
  reject(Error("AbortError"));
  await Promise.resolve();
  music.update(true, "active");
  assert.equal(plays, 2);
});

test("blocked autoplay retries on first gesture; mute and background never restart audio", async () => {
  let plays = 0,
    created = 0,
    pauses = 0;
  const music = new Music(() => {
    created++;
    return {
      play: () => {
        plays++;
        return plays === 1
          ? Promise.reject(Error("NotAllowedError"))
          : Promise.resolve();
      },
      pause: () => {
        pauses++;
      },
    };
  });
  music.update(false, "home");
  assert.equal(created, 0);
  music.update(true, "home");
  await Promise.resolve();
  for (let i = 0; i < 100; i++) music.update(true, "home");
  assert.equal(plays, 1);
  music.gesture(true, "home");
  await Promise.resolve();
  assert.equal(plays, 2);
  music.setForeground(false);
  for (let i = 0; i < 20; i++) music.update(true, "home");
  music.gesture(true, "home");
  assert.equal(plays, 2);
  music.setForeground(true);
  music.update(false, "home");
  assert.equal(plays, 2);
  music.gesture(true, "home");
  assert.equal(plays, 3);
  for (const phase of ["intro", "ready", "active", "home"])
    music.update(true, phase);
  assert.equal(plays, 3);
  assert.equal(created, 1);
  music.update(true, "ad");
  music.update(true, "paused");
  assert.equal(plays, 3);
  music.update(true, "home");
  assert.equal(plays, 4);
  assert.ok(pauses >= 3);
});

test("player creation failure can recover on a later gesture without frame retries", () => {
  let attempts = 0,
    plays = 0;
  const music = new Music(() => {
    if (++attempts === 1) throw Error("unavailable");
    return {
      play: () => {
        plays++;
      },
      pause: () => {},
    };
  });
  music.update(true, "home");
  music.update(true, "home");
  assert.equal(attempts, 1);
  music.gesture(true, "home");
  music.update(true, "home");
  assert.equal(attempts, 2);
  assert.equal(plays, 1);
});
