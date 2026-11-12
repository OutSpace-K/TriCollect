import { BufferedMusic, type LoopContext } from "./buffered-music";
import { createWechatPlayer } from "./wechat-audio";
import type { MusicPlayer } from "./music";

type MusicApi = Pick<WechatMinigame.Wx, "createInnerAudioContext"> &
  Partial<
    Pick<WechatMinigame.Wx, "createWebAudioContext" | "getFileSystemManager">
  >;

export function createWechatMusic(api: MusicApi): MusicPlayer {
  const src = "assets/ambience.wav";
  const fallback = () => createWechatPlayer(api, src, true, 0.22);
  if (!api.createWebAudioContext || !api.getFileSystemManager)
    return fallback();
  let context: WechatMinigame.WebAudioContext | undefined;
  try {
    const audio = api.createWebAudioContext();
    context = audio;
    const load = () =>
      new Promise<AudioBuffer>((resolve, reject) => {
        api.getFileSystemManager!().readFile({
          filePath: src,
          success: ({ data }) => {
            if (typeof data === "string") {
              reject(Error("Music must be loaded as binary data"));
              return;
            }
            try {
              // WeChat documents callbacks, whereas browsers may also return a
              // Promise. Observe both without allowing an unhandled rejection.
              const result = audio.decodeAudioData(data, resolve, reject);
              const promise = result as unknown as Promise<AudioBuffer>;
              if (typeof promise?.then === "function")
                void promise.then(resolve, reject);
            } catch (error) {
              reject(error);
            }
          },
          fail: reject,
        });
      });
    // The official WeChat node types omit DOM members; only the documented
    // shared WebAudio subset in LoopContext is used by BufferedMusic.
    return new BufferedMusic(audio as unknown as LoopContext, load, fallback);
  } catch (error) {
    console.warn("TriCollect WebAudio unavailable; using native loop", error);
    try {
      void Promise.resolve(context?.close()).catch(() => {});
    } catch {}
    return fallback();
  }
}
