/** One loop: try foreground autoplay, retry a rejected attempt only on a gesture. */
export interface MusicPlayer {
  play(): void | Promise<unknown>;
  pause(): void;
  onError?(callback: () => void): void;
}
export class Music {
  private player?: MusicPlayer;
  private foreground = true;
  private playing = false;
  private failed = false;
  private attempt = 0;
  constructor(private create: () => MusicPlayer) {}
  gesture(enabled: boolean, phase: string) {
    this.failed = false;
    this.update(enabled, phase);
  }
  update(enabled: boolean, phase: string) {
    const wanted =
      enabled &&
      this.foreground &&
      ["home", "intro", "ready", "active", "resolving", "rotating"].includes(
        phase,
      );
    if (!wanted || this.failed) {
      this.suspend();
      return;
    }
    if (this.playing) return;
    try {
      if (!this.player) {
        this.player = this.create();
        this.player.onError?.(() => this.fail());
      }
      if (this.failed) return;
      this.playing = true;
      const attempt = ++this.attempt;
      const result = this.player.play();
      if (result && typeof result.then === "function")
        void result.catch(() => {
          if (this.playing && attempt === this.attempt) this.fail();
        });
    } catch {
      this.fail();
    }
  }
  setForeground(value: boolean) {
    this.foreground = value;
    if (!value) this.suspend();
  }
  suspend() {
    if (!this.playing) return;
    this.playing = false;
    this.attempt++;
    try {
      this.player?.pause();
    } catch {}
  }
  private fail() {
    this.failed = true;
    this.suspend();
  }
}
