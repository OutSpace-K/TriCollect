/** One loop: retry blocked playback on a gesture, never once per frame. */
export interface MusicPlayer {
  play(): void | Promise<unknown>;
  pause(): void;
  readonly paused?: boolean;
  onError?(callback: () => void): void;
  onPlay?(callback: () => void): void;
  onPause?(callback: () => void): void;
  onStop?(callback: () => void): void;
}
export class Music {
  private player?: MusicPlayer;
  private foreground = true;
  private interrupted = false;
  private wanted = false;
  private playing = false;
  private pending = false;
  private failed = false;
  private attempt = 0;
  constructor(private create: () => MusicPlayer) {}
  gesture(enabled: boolean, phase: string) {
    // A void-returning native play may be silently blocked before first input.
    if (this.pending) this.suspend();
    this.failed = false;
    this.update(enabled, phase);
  }
  update(enabled: boolean, phase: string) {
    this.wanted =
      enabled &&
      this.foreground &&
      !this.interrupted &&
      ["home", "intro", "ready", "active", "resolving", "rotating"].includes(
        phase,
      );
    if (!this.wanted || this.failed) {
      this.suspend();
      return;
    }
    if (this.playing || this.pending) return;
    try {
      if (!this.player) {
        this.player = this.create();
        this.player.onError?.(() => this.fail());
        this.player.onPlay?.(() => {
          if (!this.wanted || this.failed || (!this.pending && !this.playing)) {
            this.pausePlayer();
            return;
          }
          this.pending = false;
          this.playing = true;
        });
        const stopped = () => {
          // A delayed acknowledgement of our own pause must not cancel a retry.
          if (!this.playing || this.player?.paused === false) return;
          this.playing = false;
          this.failed = true;
        };
        this.player.onPause?.(stopped);
        this.player.onStop?.(stopped);
      }
      if (this.failed) return;
      this.pending = true;
      const attempt = ++this.attempt;
      const result = this.player.play();
      if (result && typeof result.then === "function") {
        void result.then(
          () => {
            if (attempt !== this.attempt) return;
            this.pending = false;
            this.playing = true;
          },
          () => {
            if (attempt === this.attempt) this.fail();
          },
        );
      } else if (!this.player.onPlay) {
        // Synchronous players have no native playback acknowledgement.
        this.pending = false;
        this.playing = true;
      }
    } catch {
      this.fail();
    }
  }
  setForeground(value: boolean) {
    this.foreground = value;
    if (!value) this.suspend();
  }
  setInterrupted(value: boolean) {
    this.interrupted = value;
    if (value) this.suspend();
    else this.failed = false;
  }
  suspend() {
    this.wanted = false;
    if (!this.playing && !this.pending) return;
    this.playing = false;
    this.pending = false;
    this.attempt++;
    this.pausePlayer();
  }
  private pausePlayer() {
    try {
      this.player?.pause();
    } catch {}
  }
  private fail() {
    this.failed = true;
    this.suspend();
  }
}
