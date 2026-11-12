import type { MusicPlayer } from "./music";

/** The subset shared by browser and WeChat WebAudio; no DOM is accessed. */
export type LoopContext = Pick<
  AudioContext,
  | "currentTime"
  | "state"
  | "destination"
  | "onstatechange"
  | "createGain"
  | "createBufferSource"
  | "resume"
  | "suspend"
  | "close"
>;

/** Decode once, loop on the audio thread, and never restart at file boundaries. */
export class BufferedMusic implements MusicPlayer {
  private gain: GainNode;
  private source?: AudioBufferSourceNode;
  private buffer?: AudioBuffer;
  private loading?: Promise<AudioBuffer>;
  private native?: MusicPlayer;
  private nativeOnly = false;
  private wanted = false;
  private isPaused = true;
  private attempt = 0;
  private offset = 0;
  private startedAt = 0;
  private startupTimer?: ReturnType<typeof setTimeout>;
  private listeners = {
    play: new Set<() => void>(),
    pause: new Set<() => void>(),
    error: new Set<() => void>(),
  };

  constructor(
    private context: LoopContext,
    private load: () => Promise<AudioBuffer>,
    private fallback: () => MusicPlayer,
    private volume = 0.22,
    private loadTimeoutMs = 5000,
  ) {
    this.gain = context.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(context.destination);
    context.onstatechange = () => {
      if (this.nativeOnly || !this.source || !this.wanted) return;
      if (context.state === "closed") {
        this.useNative(Error("WebAudio context closed"));
      } else if (context.state !== "running") {
        this.pause();
        this.emit("pause");
      }
    };
  }

  get paused() {
    return this.isPaused;
  }
  onPlay(callback: () => void) {
    this.listeners.play.add(callback);
  }
  onPause(callback: () => void) {
    this.listeners.pause.add(callback);
  }
  onError(callback: () => void) {
    this.listeners.error.add(callback);
  }

  play() {
    this.wanted = true;
    if (!this.isPaused) return;
    const attempt = ++this.attempt;
    if (this.nativeOnly) {
      this.playNative();
      return;
    }
    this.clearStartupTimer();
    this.startupTimer = setTimeout(() => {
      if (attempt === this.attempt && this.wanted)
        this.useNative(Error("Music resume/start timed out"));
    }, this.loadTimeoutMs);
    try {
      // Call resume synchronously inside the gesture, before file/decode awaits.
      const resumed = this.context.resume();
      void Promise.all([this.prepare(), Promise.resolve(resumed)]).then(
        ([buffer]) => {
          if (attempt !== this.attempt || !this.wanted || this.nativeOnly)
            return;
          this.clearStartupTimer();
          if (this.context.state !== "running") {
            this.useNative(Error("WebAudio did not enter running state"));
            return;
          }
          try {
            const source = this.context.createBufferSource();
            this.source = source;
            source.buffer = buffer;
            source.loop = true;
            source.loopStart = 0;
            source.loopEnd = buffer.duration;
            source.connect(this.gain);
            source.onended = () => {
              if (this.source === source && this.wanted)
                this.useNative(Error("Looping WebAudio source ended"));
            };
            this.startedAt = this.context.currentTime;
            this.offset %= buffer.duration;
            this.gain.gain.value = this.volume;
            source.start(0, this.offset);
            this.isPaused = false;
            this.emit("play");
          } catch (error) {
            this.useNative(error);
          }
        },
        (error) => {
          if (attempt === this.attempt) this.useNative(error);
        },
      );
    } catch (error) {
      this.useNative(error);
    }
  }

  pause() {
    this.wanted = false;
    this.attempt++;
    this.clearStartupTimer();
    this.isPaused = true;
    this.stopSource();
    if (this.nativeOnly) {
      try {
        this.native?.pause();
      } catch {}
    } else {
      try {
        void Promise.resolve(this.context.suspend()).catch(() => {});
      } catch {}
    }
  }

  private prepare() {
    if (!this.loading) {
      this.loading = new Promise<AudioBuffer>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(Error("Music read/decode timed out")),
          this.loadTimeoutMs,
        );
        void Promise.resolve()
          .then(this.load)
          .then(
            (buffer) => {
              clearTimeout(timer);
              if (
                !buffer ||
                !Number.isFinite(buffer.duration) ||
                buffer.duration <= 0
              )
                reject(Error("Invalid decoded music duration"));
              else {
                if (!this.nativeOnly) this.buffer = buffer;
                resolve(buffer);
              }
            },
            (error) => {
              clearTimeout(timer);
              reject(error);
            },
          );
      });
    }
    return this.loading;
  }

  private stopSource() {
    // Disconnect immediately, even if suspend() has not resolved yet.
    try {
      this.gain.gain.value = 0;
    } catch {}
    const source = this.source;
    this.source = undefined;
    if (!source) return;
    if (this.buffer && this.context.state !== "closed")
      this.offset =
        (this.offset + Math.max(0, this.context.currentTime - this.startedAt)) %
        this.buffer.duration;
    source.onended = null;
    try {
      source.stop();
    } catch {}
    try {
      source.disconnect();
    } catch {}
  }

  private useNative(error: unknown) {
    this.clearStartupTimer();
    if (!this.nativeOnly) {
      console.warn(
        "TriCollect buffered music unavailable; using native loop",
        error,
      );
      this.nativeOnly = true;
      this.attempt++;
      this.stopSource();
      this.buffer = undefined;
      this.loading = undefined;
      this.isPaused = true;
      this.context.onstatechange = null;
      try {
        this.gain.disconnect();
      } catch {}
      try {
        void Promise.resolve(this.context.close()).catch(() => {});
      } catch {}
    }
    if (this.wanted) this.playNative();
  }

  private playNative() {
    try {
      if (!this.native) {
        const player = this.fallback();
        this.native = player;
        player.onPlay?.(() => {
          if (!this.wanted) {
            try {
              player.pause();
            } catch {}
            return;
          }
          this.isPaused = false;
          this.emit("play");
        });
        const stopped = () => {
          if (!this.wanted || player.paused === false) return;
          this.isPaused = true;
          this.emit("pause");
        };
        player.onPause?.(stopped);
        player.onStop?.(stopped);
        player.onError?.(() => {
          this.isPaused = true;
          if (this.wanted) this.emit("error");
        });
      }
      this.native.play();
    } catch {
      this.emit("error");
    }
  }

  private emit(event: keyof BufferedMusic["listeners"]) {
    for (const callback of this.listeners[event]) callback();
  }

  private clearStartupTimer() {
    clearTimeout(this.startupTimer);
    this.startupTimer = undefined;
  }
}
