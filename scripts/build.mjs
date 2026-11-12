import { build } from "esbuild";
import { mkdir, writeFile, readFile, cp } from "node:fs/promises";
let platform = { appId: "", rewardedVideoAdUnitId: "", environment: "prod" };
try {
  platform = {
    ...platform,
    ...JSON.parse(await readFile("config/platform.local.json", "utf8")),
  };
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
if (
  typeof platform.appId !== "string" ||
  typeof platform.rewardedVideoAdUnitId !== "string"
)
  throw Error("Platform IDs must be strings");
if (platform.environment !== "prod")
  throw Error(
    "WeChat builds require environment=prod; use browser preview for mock ads",
  );
await mkdir("dist/wechat/assets", { recursive: true });
await mkdir("dist/browser", { recursive: true });
await build({
  entryPoints: ["src/wechat.ts"],
  bundle: true,
  outfile: "dist/wechat/game.js",
  format: "iife",
  target: "es2018",
  define: { AD_UNIT: JSON.stringify(platform.rewardedVideoAdUnitId) },
  legalComments: "none",
});
await build({
  entryPoints: ["src/browser.ts"],
  bundle: true,
  outfile: "dist/browser/app.js",
  format: "iife",
  target: "es2020",
});
await cp("assets/tap.wav", "dist/wechat/assets/tap.wav");
await cp("assets/ambience.wav", "dist/wechat/assets/ambience.wav");
await mkdir("dist/browser/assets", { recursive: true });
await cp("assets/ambience.wav", "dist/browser/assets/ambience.wav");
await cp("assets/background.png", "dist/browser/assets/background.png");
await cp("assets/background.png", "dist/wechat/assets/background.png");
await cp(
  "assets/play-background.png",
  "dist/browser/assets/play-background.png",
);
await cp(
  "assets/play-background.png",
  "dist/wechat/assets/play-background.png",
);
await writeFile(
  "dist/wechat/game.json",
  JSON.stringify(
    { deviceOrientation: "portrait", showStatusBar: false },
    null,
    2,
  ),
);
await writeFile(
  "dist/wechat/project.config.json",
  JSON.stringify(
    {
      description: "TriCollect native WeChat Mini Game",
      compileType: "game",
      appid: platform.appId || "touristappid",
      projectname: "TriCollect",
      setting: { es6: false, minified: false, urlCheck: true },
      libVersion: "3.7.1",
    },
    null,
    2,
  ),
);
await writeFile(
  "dist/browser/index.html",
  '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><title>转个“球” · 开发预览</title><style>*{box-sizing:border-box}body{margin:0;background:#fff9ed;display:flex;justify-content:center}canvas{display:block;touch-action:none}</style><canvas aria-label="转个“球”游戏"></canvas><script src="app.js"></script></html>',
);
console.log(
  "Built native WeChat game + optional browser development preview. Real device verification pending.",
);

for (const file of ["home-logo.png", "home-hero.png", "balls-candy.png"]) {
  await cp(`assets/${file}`, `dist/browser/assets/${file}`);
  await cp(`assets/${file}`, `dist/wechat/assets/${file}`);
}
