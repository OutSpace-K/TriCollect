export type AdOutcome = "completed" | "cancelled" | "failed";
export interface AdService {
  available: boolean;
  label: string;
  request(): Promise<AdOutcome>;
}
export interface Video {
  load(): Promise<unknown>;
  show(): Promise<unknown>;
  onClose(fn: (r: { isEnded?: boolean }) => void): void;
  offClose(fn: (r: { isEnded?: boolean }) => void): void;
  onError(fn: (r: unknown) => void): void;
  offError(fn: (r: unknown) => void): void;
}
export class WeChatAd implements AdService {
  available: boolean;
  label = "微信激励视频";
  private busy = false;
  private serial = 0;
  constructor(private video: Video | null) {
    this.available = !!video;
  }
  request(): Promise<AdOutcome> {
    if (!this.video || !this.available || this.busy)
      return Promise.resolve("failed");
    this.busy = true;
    const v = this.video,
      token = ++this.serial;
    return new Promise((resolve) => {
      let finished = false;
      const done = (outcome: AdOutcome) => {
        if (finished || token !== this.serial) return;
        finished = true;
        clearTimeout(timer);
        v.offClose(close);
        v.offError(error);
        this.busy = false;
        resolve(outcome);
      };
      const close = (r: { isEnded?: boolean }) =>
        done(r?.isEnded === true ? "completed" : "cancelled");
      const error = () => done("failed");
      const timer = setTimeout(() => {
        this.available = false;
        done("failed");
      }, 120_000);
      v.onClose(close);
      v.onError(error);
      // Loading and showing are never reward evidence.
      v.load()
        .then(() => {
          if (!finished) return v.show();
        })
        .catch(error);
    });
  }
}
export class UnavailableAd implements AdService {
  available = false;
  label = "广告未配置";
  request() {
    return Promise.resolve<AdOutcome>("failed");
  }
}
