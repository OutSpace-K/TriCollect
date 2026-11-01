import { test } from "node:test";
import assert from "node:assert/strict";
import { Music } from "../src/platform/music";
test("music needs gesture, reuses one player, pauses for every inactive lifecycle", () => {
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
  music.update(true, "active");
  assert.equal(created, 0);
  music.gesture(true, "intro");
  for (let i = 0; i < 100; i++) music.update(true, "active");
  assert.equal(plays, 1);
  for (const phase of [
    "paused",
    "ad",
    "expired",
    "blocked",
    "result",
    "home",
  ]) {
    music.update(true, phase);
    music.update(true, phase);
    music.gesture(true, "active");
  }
  assert.equal(pauses, 6);
  assert.equal(created, 1);
  assert.equal(plays, 7);
  music.suspend();
  music.update(false, "active");
  assert.equal(plays, 7);
  music.gesture(true, "active");
  assert.equal(plays, 8);
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
