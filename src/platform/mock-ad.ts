import type { AdService, AdOutcome } from "./ads";
// Imported ONLY by browser development entry; absent from WeChat production bundle.
export class MockAd implements AdService {
  available = true;
  label = "开发模拟（无真实广告）";
  request(): Promise<AdOutcome> {
    return Promise.resolve(
      window.confirm(
        "开发模拟广告：确定 = 模拟完成；取消 = 未完成。不会展示真实广告。",
      )
        ? "completed"
        : "cancelled",
    );
  }
}
