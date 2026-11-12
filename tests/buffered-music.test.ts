import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BufferedMusic,
  type LoopContext,
} from "../src/platform/buffered-music";
import { Music } from "../src/platform/music";
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
function fixture(load?: () => Promise<AudioBuffer>, timeout = 5000) {
  const sources: any[] = [];
  const events: Record<string, () => void> = {};
  const native = {
    paused: true,
    plays: 0,
    pauses: 0,
    play() {
      this.plays++;
      this.paused = false;
      events.play?.();
    },
    pause() {
      this.pauses++;
      this.paused = true;
    },
    onPlay(fn: () => void) {
      events.play = fn;
    },
    onPause(fn: () => void) {
      events.pause = fn;
    },
    onError(fn: () => void) {
      events.error = fn;
    },
    onStop(fn: () => void) {
      events.stop = fn;
    },
  };
  const gain = { gain: { value: 0 }, connect() {}, disconnect() {} };
  const context = {
    currentTime: 0,
    state: "running",
    destination: {},
    onstatechange: null as null | (() => void),
    createGain: () => gain,
    createBufferSource() {
      const s = {
        buffer: null,
        loop: false,
        loopStart: -1,
        loopEnd: -1,
        onended: null as null | (() => void),
        starts: [] as number[][],
        stops: 0,
        disconnected: false,
        connect() {},
        disconnect() {
          this.disconnected = true;
        },
        start(...args: number[]) {
          this.starts.push(args);
        },
        stop() {
          this.stops++;
        },
      };
      sources.push(s);
      return s;
    },
    resume: () => Promise.resolve(),
    suspend: () => Promise.resolve(),
    close: () => Promise.resolve(),
  };
  let loads = 0,
    fallbacks = 0;
  const player = new BufferedMusic(
    context as unknown as LoopContext,
    () => {
      loads++;
      return load ? load() : Promise.resolve({ duration: 32 } as AudioBuffer);
    },
    () => {
      fallbacks++;
      return native;
    },
    0.22,
    timeout,
  );
  return {
    player,
    context,
    gain,
    sources,
    native,
    events,
    get loads() {
      return loads;
    },
    get fallbacks() {
      return fallbacks;
    },
  };
}
test("decoded buffer loops on audio thread beyond 100 seconds without reloading or restarting", async () => {
  const f = fixture();
  f.player.play();
  await flush();
  assert.equal(f.loads, 1);
  const s = f.sources[0];
  assert.equal(s.loop, true);
  assert.equal(s.loopStart, 0);
  assert.equal(s.loopEnd, 32);
  assert.deepEqual(s.starts, [[0, 0]]);
  assert.equal(f.gain.gain.value, 0.22);
  f.context.currentTime = 101;
  for (let i = 0; i < 100; i++) f.player.play();
  await flush();
  assert.equal(f.sources.length, 1);
  assert.equal(f.loads, 1);
  f.player.pause();
});
test("pause silences immediately and resumes at accumulated modulo offset", async () => {
  const f = fixture();
  f.player.play();
  await flush();
  f.context.currentTime = 101;
  const oldEnd = f.sources[0].onended;
  f.player.pause();
  assert.equal(f.gain.gain.value, 0);
  assert.equal(f.sources[0].stops, 1);
  assert.equal(f.sources[0].disconnected, true);
  oldEnd();
  assert.equal(f.fallbacks, 0);
  f.player.play();
  await flush();
  assert.deepEqual(f.sources[1].starts, [[0, 5]]);
  f.context.currentTime = 133;
  f.player.pause();
  f.player.play();
  await flush();
  assert.deepEqual(f.sources[2].starts, [[0, 5]]);
  assert.equal(f.loads, 1);
  f.player.pause();
});
for (const gate of ["mute", "hidden", "ad", "paused", "interruption"] as const)
  test(`Music ${gate} gate prevents delayed decode from starting and allows later recovery`, async () => {
    const d = deferred<AudioBuffer>();
    const f = fixture(() => d.promise);
    const m = new Music(() => f.player);
    m.gesture(true, "active");
    if (gate === "mute") m.update(false, "active");
    else if (gate === "hidden") m.setForeground(false);
    else if (gate === "interruption") m.setInterrupted(true);
    else m.update(true, gate);
    d.resolve({ duration: 32 } as AudioBuffer);
    await flush();
    assert.equal(f.sources.length, 0);
    assert.equal(f.native.plays, 0);
    m.setForeground(true);
    m.setInterrupted(false);
    m.gesture(true, "active");
    await flush();
    assert.equal(f.sources.length, 1);
    m.suspend();
  });
test("late resume success after cancellation cannot start sound", async () => {
  const d = deferred<void>();
  const f = fixture();
  f.context.resume = () => d.promise;
  f.player.play();
  await flush();
  f.player.pause();
  d.resolve();
  await flush();
  assert.equal(f.sources.length, 0);
  assert.equal(f.fallbacks, 0);
});
test("quick cancel and retry shares decode and ignores previous rejected resume", async () => {
  const d = deferred<AudioBuffer>(),
    first = deferred<void>();
  const f = fixture(() => d.promise);
  let resumes = 0;
  f.context.resume = () =>
    ++resumes === 1 ? first.promise : Promise.resolve();
  f.player.play();
  f.player.pause();
  f.player.play();
  first.reject(Error("stale"));
  d.resolve({ duration: 32 } as AudioBuffer);
  await flush();
  assert.equal(f.sources.length, 1);
  assert.equal(f.loads, 1);
  assert.equal(f.fallbacks, 0);
  f.player.pause();
});
for (const failure of ["load", "resume", "source", "start", "ended"] as const)
  test(`${failure} failure falls back once and reuses the native player`, async () => {
    const f = fixture(
      failure === "load" ? () => Promise.reject(Error("load")) : undefined,
    );
    if (failure === "resume")
      f.context.resume = () => Promise.reject(Error("resume"));
    if (failure === "source")
      f.context.createBufferSource = () => {
        throw Error("source");
      };
    if (failure === "start") {
      const create = f.context.createBufferSource;
      f.context.createBufferSource = () => {
        const s = create();
        s.start = () => {
          throw Error("start");
        };
        return s;
      };
    }
    f.player.play();
    await flush();
    if (failure === "ended") f.sources[0].onended();
    assert.equal(f.fallbacks, 1);
    assert.equal(f.native.plays, 1);
    f.player.pause();
    f.player.play();
    assert.equal(f.fallbacks, 1);
    assert.equal(f.native.plays, 2);
    assert.equal(f.player.paused, false);
    f.events.pause();
    assert.equal(f.player.paused, false);
    f.player.pause();
    f.events.play();
    assert.equal(f.player.paused, true);
    assert.ok(f.native.pauses >= 3);
  });
test("decode timeout falls back and ignores late decoded buffer", async () => {
  const d = deferred<AudioBuffer>();
  const f = fixture(() => d.promise, 5);
  f.player.play();
  await new Promise((r) => setTimeout(r, 20));
  await flush();
  assert.equal(f.fallbacks, 1);
  d.resolve({ duration: 32 } as AudioBuffer);
  await flush();
  assert.equal(f.sources.length, 0);
  assert.equal(f.native.plays, 1);
  f.player.pause();
});
test("cancelled failing decode never starts native fallback", async () => {
  const d = deferred<AudioBuffer>();
  const f = fixture(() => d.promise);
  f.player.play();
  f.player.pause();
  d.reject(Error("late"));
  await flush();
  assert.equal(f.fallbacks, 0);
  assert.equal(f.sources.length, 0);
});
for (const gate of ["mute", "hidden", "ad", "paused", "interruption"] as const)
  test(`active buffered playback is immediately disconnected by ${gate}`, async () => {
    const f = fixture();
    const m = new Music(() => f.player);
    m.gesture(true, "active");
    await flush();
    assert.equal(f.sources.length, 1);
    if (gate === "mute") m.update(false, "active");
    else if (gate === "hidden") m.setForeground(false);
    else if (gate === "interruption") m.setInterrupted(true);
    else m.update(true, gate);
    assert.equal(f.gain.gain.value, 0);
    assert.equal(f.sources[0].disconnected, true);
    assert.equal(f.player.paused, true);
    await flush();
    assert.equal(f.sources.length, 1);
  });
test("unexpected context close switches once to native while stale state events are ignored", async () => {
  const f = fixture();
  f.player.play();
  await flush();
  const oldState = f.context.onstatechange!;
  f.context.state = "closed";
  oldState();
  assert.equal(f.fallbacks, 1);
  assert.equal(f.native.plays, 1);
  oldState();
  assert.equal(f.native.plays, 1);
  assert.equal(f.context.onstatechange, null);
  f.player.pause();
});
test("external context suspension waits for gesture rather than restarting each frame", async () => {
  const f = fixture();
  const m = new Music(() => f.player);
  m.gesture(true, "active");
  await flush();
  f.context.state = "suspended";
  f.context.onstatechange!();
  assert.equal(f.gain.gain.value, 0);
  for (let i = 0; i < 100; i++) m.update(true, "active");
  assert.equal(f.sources.length, 1);
  f.context.state = "running";
  m.gesture(true, "active");
  await flush();
  assert.equal(f.sources.length, 2);
  m.suspend();
});
for (const duration of [0, -1, NaN, Infinity])
  test(`invalid duration ${duration} cannot create looping source`, async () => {
    const f = fixture(() => Promise.resolve({ duration } as AudioBuffer));
    f.player.play();
    await flush();
    assert.equal(f.sources.length, 0);
    assert.equal(f.fallbacks, 1);
    f.player.pause();
  });

for (const buffer of [null, undefined])
  test(`missing decoded buffer (${buffer}) falls back without an unhandled rejection`, async () => {
    const f = fixture(() => Promise.resolve(buffer as unknown as AudioBuffer));
    f.player.play();
    await flush();
    assert.equal(f.sources.length, 0);
    assert.equal(f.native.plays, 1);
  });
test("never-settling resume falls back after overall startup timeout", async () => {
  const f = fixture(undefined, 8);
  f.context.resume = () => new Promise(() => {});
  f.player.play();
  await new Promise((r) => setTimeout(r, 25));
  await flush();
  assert.equal(f.fallbacks, 1);
  assert.equal(f.native.plays, 1);
  f.player.pause();
});
for (const state of ["suspended", "closed"])
  test(`fulfilled resume with ${state} context falls back`, async () => {
    const d = deferred<AudioBuffer>();
    const f = fixture(() => d.promise);
    f.player.play();
    f.context.state = state;
    d.resolve({ duration: 32 } as AudioBuffer);
    await flush();
    assert.equal(f.fallbacks, 1);
    assert.equal(f.sources.length, 0);
    f.player.pause();
  });
test("cancelled startup watchdog cannot start native sound while muted", async () => {
  const f = fixture(undefined, 8);
  f.context.resume = () => new Promise(() => {});
  const m = new Music(() => f.player);
  m.gesture(true, "active");
  m.update(false, "active");
  await new Promise((r) => setTimeout(r, 25));
  await flush();
  assert.equal(f.fallbacks, 0);
  assert.equal(f.native.plays, 0);
  assert.equal(f.sources.length, 0);
});
test("cancelled startup watchdog cannot interrupt a successful immediate retry", async () => {
  const f = fixture(undefined, 8);
  const old = deferred<void>();
  let attempts = 0;
  f.context.resume = () => (++attempts === 1 ? old.promise : Promise.resolve());
  f.player.play();
  f.player.pause();
  f.player.play();
  await flush();
  assert.equal(f.sources.length, 1);
  await new Promise((r) => setTimeout(r, 25));
  old.resolve();
  await flush();
  assert.equal(f.sources.length, 1);
  assert.equal(f.fallbacks, 0);
  assert.equal(f.player.paused, false);
  f.player.pause();
});
