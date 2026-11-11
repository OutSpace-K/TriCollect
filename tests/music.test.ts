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

function nativeMusic() {
  const listeners: Record<string, () => void> = {};
  let plays = 0,
    pauses = 0,
    paused = true;
  const music = new Music(() => ({
    get paused() {
      return paused;
    },
    play() {
      plays++;
    },
    pause() {
      paused = true;
      pauses++;
    },
    onPlay: (fn) => (listeners.play = fn),
    onPause: (fn) => (listeners.pause = fn),
    onStop: (fn) => (listeners.stop = fn),
    onError: (fn) => (listeners.error = fn),
  }));
  return {
    music,
    get plays() {
      return plays;
    },
    get pauses() {
      return pauses;
    },
    emit(event: string) {
      if (event === "play") paused = false;
      if (event === "pause" || event === "stop") paused = true;
      listeners[event]();
    },
    acknowledgeOldPause: () => listeners.pause(),
  };
}

test("native void play waits for onPlay and retries silently blocked autoplay on input", () => {
  const n = nativeMusic();
  n.music.update(true, "home");
  for (let i = 0; i < 100; i++) n.music.update(true, "home");
  assert.equal(n.plays, 1);
  n.music.gesture(true, "home");
  assert.equal(n.plays, 2);
  n.emit("play");
  n.acknowledgeOldPause();
  n.music.gesture(true, "active");
  assert.equal(n.plays, 2);
});

test("native pause, stop and error recover on gestures without frame retry loops", () => {
  for (const event of ["pause", "stop", "error"]) {
    const n = nativeMusic();
    n.music.gesture(true, "home");
    n.emit("play");
    n.emit(event);
    for (let i = 0; i < 100; i++) n.music.update(true, "home");
    assert.equal(n.plays, 1, event);
    n.music.gesture(true, "home");
    assert.equal(n.plays, 2, event);
  }
});

test("late native play is paused after mute, suspension, ads or hiding", () => {
  for (const cancel of [
    (m: Music) => m.update(false, "home"),
    (m: Music) => m.suspend(),
    (m: Music) => m.update(true, "ad"),
    (m: Music) => m.setForeground(false),
  ]) {
    const n = nativeMusic();
    n.music.update(true, "home");
    cancel(n.music);
    assert.equal(n.pauses, 1);
    n.emit("play");
    assert.equal(n.pauses, 2);
    assert.equal(n.plays, 1);
  }
});

test("system interruption blocks input and only resumes an enabled foreground allowed phase", () => {
  for (const [enabled, phase, foreground, resume] of [
    [true, "home", true, true],
    [false, "home", true, false],
    [true, "paused", true, false],
    [true, "ad", true, false],
    [true, "active", false, false],
  ] as const) {
    const n = nativeMusic();
    n.music.update(true, "home");
    n.emit("play");
    n.music.setInterrupted(true);
    n.music.gesture(true, "home");
    n.music.update(true, "home");
    assert.equal(n.plays, 1);
    n.music.setForeground(foreground);
    n.music.setInterrupted(false);
    n.music.update(enabled, phase);
    assert.equal(n.plays, resume ? 2 : 1);
  }
});
