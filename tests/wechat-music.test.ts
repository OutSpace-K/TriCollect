import { test } from "node:test";
import assert from "node:assert/strict";
import { createWechatMusic } from "../src/platform/wechat-music";
import { Music } from "../src/platform/music";
const flush = async () => {
  for (let i = 0; i < 15; i++) await Promise.resolve();
};
function fixture() {
  const sources: any[] = [];
  let nativeCreates = 0,
    reads = 0,
    decodes = 0;
  let readOptions: any;
  const native = {
    src: "",
    loop: false,
    volume: 1,
    obeyMuteSwitch: true,
    plays: 0,
    play() {
      this.plays++;
    },
    pause() {},
    onError() {},
  };
  const bytes = new ArrayBuffer(16);
  const buffer = { duration: 32 } as AudioBuffer;
  const audio = {
    currentTime: 0,
    state: "running",
    destination: {},
    onstatechange: null,
    closed: 0,
    createGain: () => ({ gain: { value: 0 }, connect() {}, disconnect() {} }),
    createBufferSource() {
      const s = {
        connect() {},
        disconnect() {},
        start() {},
        stop() {},
        loop: false,
        buffer: null,
      };
      sources.push(s);
      return s;
    },
    resume: () => Promise.resolve(),
    suspend: () => Promise.resolve(),
    close() {
      this.closed++;
      return Promise.resolve();
    },
    decodeAudioData(
      data: ArrayBuffer,
      success: (b: AudioBuffer) => void,
      _fail: (e: unknown) => void,
    ): unknown {
      decodes++;
      assert.equal(data, bytes);
      success(buffer);
      return buffer;
    },
  };
  const api = {
    createWebAudioContext: () => audio,
    getFileSystemManager: () => ({
      readFile(options: any) {
        reads++;
        readOptions = options;
        options.success({ data: bytes });
      },
    }),
    createInnerAudioContext() {
      nativeCreates++;
      return native;
    },
  };
  const create = () =>
    createWechatMusic(
      api as unknown as Parameters<typeof createWechatMusic>[0],
    );
  return {
    api,
    audio,
    native,
    bytes,
    buffer,
    sources,
    create,
    get nativeCreates() {
      return nativeCreates;
    },
    get reads() {
      return reads;
    },
    get decodes() {
      return decodes;
    },
    get readOptions() {
      return readOptions;
    },
  };
}
test("factory loads packaged WAV as binary and handles documented callback decode", async () => {
  const f = fixture();
  const p = f.create();
  p.play();
  await flush();
  assert.equal(f.readOptions.filePath, "assets/ambience.wav");
  assert.equal(f.readOptions.encoding, undefined);
  assert.equal(f.reads, 1);
  assert.equal(f.decodes, 1);
  assert.equal(f.sources.length, 1);
  p.pause();
  p.play();
  await flush();
  assert.equal(f.reads, 1);
  assert.equal(f.sources.length, 2);
  p.pause();
});
for (const missing of [
  "createWebAudioContext",
  "getFileSystemManager",
] as const)
  test(`missing ${missing} preserves native WAV looping configuration`, () => {
    const f = fixture();
    delete (f.api as any)[missing];
    const p = f.create();
    assert.equal(p, f.native);
    assert.equal(f.native.src, "assets/ambience.wav");
    assert.equal(f.native.loop, true);
    assert.equal(f.native.volume, 0.22);
    assert.equal(f.native.obeyMuteSwitch, false);
    assert.equal(f.nativeCreates, 1);
  });
for (const failure of [
  "create",
  "gain",
  "filesystem",
  "read",
  "readThrow",
  "string",
  "decode",
  "decodeThrow",
  "decodePromise",
  "resume",
] as const)
  test(`factory safely falls back on ${failure} failure`, async () => {
    const f = fixture();
    const err = Error(failure);
    if (failure === "create")
      f.api.createWebAudioContext = () => {
        throw err;
      };
    if (failure === "gain")
      f.audio.createGain = () => {
        throw err;
      };
    if (failure === "filesystem")
      f.api.getFileSystemManager = () => {
        throw err;
      };
    if (["read", "readThrow", "string"].includes(failure))
      f.api.getFileSystemManager = () => ({
        readFile(o: any) {
          if (failure === "readThrow") throw err;
          else if (failure === "string") o.success({ data: "not binary" });
          else o.fail(err);
        },
      });
    if (failure === "decode")
      f.audio.decodeAudioData = (_d, _s, fail) => fail(err);
    if (failure === "decodeThrow")
      f.audio.decodeAudioData = () => {
        throw err;
      };
    if (failure === "decodePromise")
      f.audio.decodeAudioData = () => Promise.reject(err);
    if (failure === "resume") f.audio.resume = () => Promise.reject(err);
    const p = f.create();
    assert.doesNotThrow(() => p.play());
    await flush();
    assert.equal(f.nativeCreates, 1);
    assert.equal(f.native.plays, 1);
    assert.equal(f.sources.length, 0);
    if (failure !== "create") assert.equal(f.audio.closed, 1);
    p.pause();
  });
for (const dual of [
  "promise",
  "callbackAndResolve",
  "callbackAndReject",
] as const)
  test(`decode ${dual} settles only once without duplicate sources`, async () => {
    const f = fixture();
    f.audio.decodeAudioData = (_data, success) => {
      if (dual !== "promise") success(f.buffer);
      return dual === "callbackAndReject"
        ? Promise.reject(Error("late"))
        : Promise.resolve(f.buffer);
    };
    const p = f.create();
    p.play();
    await flush();
    assert.equal(f.sources.length, 1);
    assert.equal(f.nativeCreates, 0);
    p.pause();
  });
test("unavailable native API does not escape Music gate or cause per-frame retries", () => {
  let attempts = 0;
  const music = new Music(() =>
    createWechatMusic({
      createInnerAudioContext() {
        attempts++;
        throw Error("unavailable");
      },
    }),
  );
  assert.doesNotThrow(() => music.gesture(true, "active"));
  for (let i = 0; i < 100; i++) music.update(true, "active");
  assert.equal(attempts, 1);
});
