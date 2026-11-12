import { test } from "node:test";
import assert from "node:assert/strict";
import {
  configureWechatAudio,
  createWechatPlayer,
} from "../src/platform/wechat-audio";

test("WeChat native sound overrides iOS silent switch globally and per context", () => {
  let option: WechatMinigame.SetInnerAudioOption | undefined;
  configureWechatAudio({
    setInnerAudioOption(value) {
      option = value;
      return Promise.resolve({ errMsg: "ok" });
    },
  });
  assert.equal(option?.obeyMuteSwitch, false);
  const contexts: Partial<WechatMinigame.InnerAudioContext>[] = [];
  const api = {
    createInnerAudioContext() {
      const player = { onError() {} };
      contexts.push(player);
      return player as unknown as WechatMinigame.InnerAudioContext;
    },
  };
  createWechatPlayer(api, "assets/ambience.wav", true, 0.22);
  createWechatPlayer(api, "assets/tap.wav");
  assert.deepEqual(
    contexts.map(({ src, loop, volume, obeyMuteSwitch }) => ({
      src,
      loop,
      volume,
      obeyMuteSwitch,
    })),
    [
      {
        src: "assets/ambience.wav",
        loop: true,
        volume: 0.22,
        obeyMuteSwitch: false,
      },
      { src: "assets/tap.wav", loop: false, volume: 1, obeyMuteSwitch: false },
    ],
  );
});

test("older WeChat libraries without global audio options remain supported", () => {
  assert.doesNotThrow(() =>
    configureWechatAudio({} as Pick<WechatMinigame.Wx, "setInnerAudioOption">),
  );
});

test("native fallback loop retains the backend compatible with mute-switch options", () => {
  let calls = 0;
  const player = createWechatPlayer(
    {
      createInnerAudioContext(
        options?: WechatMinigame.CreateInnerAudioContextOption,
      ) {
        calls++;
        // WeChat documents WebAudio as incompatible with setInnerAudioOption.
        // Do not trade the earlier silent-switch fix for unverified looping.
        assert.equal(options?.useWebAudioImplement, undefined);
        return { onError() {} } as unknown as WechatMinigame.InnerAudioContext;
      },
    },
    "assets/ambience.wav",
    true,
    0.22,
  );
  assert.equal(calls, 1);
  assert.equal(player.loop, true);
  assert.equal(player.obeyMuteSwitch, false);
  assert.equal(player.volume, 0.22);
});
