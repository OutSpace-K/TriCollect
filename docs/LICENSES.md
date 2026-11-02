# 资源与第三方依赖

- 项目源代码：本包 `LICENSE`（MIT）。
- 画面：程序绘制管体、渐变和彩球；`assets/background.png` 为本项目原创程序绘制陈列场景背景（拱形空间、台面、光束与光粒），无外部图片、采样或美术素材，按 MIT 随工程提供。重制脚本为 `scripts/make-background.py`，Pillow仅作为离线生成工具，不随游戏运行包分发。
- 字体：系统 sans-serif，不分发字体文件。图形使用 Unicode 符号与数字；需真机检查字体覆盖。
- `assets/tap.wav`：项目内数学正弦波与衰减合成，生成逻辑见 `scripts/make-audio.py`，无采样外部音乐，按 MIT 随工程提供。
- `assets/ambience.wav`：本项目原创32秒、135BPM休闲益智合成曲（v0.1.7轻拨弦回应、轻鼓与较弱低音编配），纯数学谐波、衰减包络、原创旋律/低音/和弦及确定性噪声打击乐，无外部采样、录音或导入旋律；生成脚本同为 `scripts/make-audio.py`，按 MIT 随工程提供。
- 构建/测试依赖：TypeScript（Apache-2.0）、esbuild（MIT）、tsx（MIT）、Prettier（MIT）、playwright-core（Apache-2.0）、@types/node（MIT）、minigame-api-typings（MIT）。具体版本与传递依赖以 `package-lock.json` 为准；第三方 license 原文打包到 `docs/third-party`。
- 不分发 Chromium 浏览器；交互测试调用用户本机安装版本。

官方接口核验：2026-11-01，读取官方 `wechat-miniprogram/minigame-api-typings` 仓库与 npm 包 3.8.21 的 `types/wx/lib.wx.api.d.ts`。该文件由微信 API 文档生成。核对 createCanvas、getPerformance/Performance.now（微秒）、getWindowInfo、激励视频单例和完成回调，以及生命周期与存储声明。官方指南网页本次抓取失败。

来源：https://github.com/wechat-miniprogram/minigame-api-typings

原设计依据：TriCollect-Project-Design-v0.1.0.docx，Library ID `libfile_9934269fa68c8191bf0861ddc97e7208`，23 页全文读取。原始文档仍保留原 Library 身份，未修改。

补充：官方类型声明仅证明文档规定微秒，不证明所有运行环境实测一致。v0.1.2 使用运行时单位校准。浏览器性能时钟规范：https://w3c.github.io/hr-time/#dom-performance-now 。

v0.1.4 音频接口核验：官方类型中的 InnerAudioContext `loop`、`volume`、`play()`、`pause()`、`onError()`；浏览器使用 HTMLAudioElement，不依赖外部服务。实际设备播放与音质未验收。

- v0.1.10局内背景 `assets/play-background.png`：本项目原创程序绘制墙面陈列、光束与台面，按MIT随工程提供。生成脚本 `scripts/make-play-background.py`，无外部图片或采样；首页原图片保留。

- v0.1.11替换首页及局内背景：两张PNG由原创脚本 `scripts/make-arcade-backgrounds.py` 生成，MIT，Pillow仅离线使用。参考研究只提炼布局和明暗规律，未复制第三方截图/素材。历史生成脚本保留，不再代表当前资源。

- v0.1.12首页与局内背景为 `scripts/make-tabletop-backgrounds.py` 原创程序绘制，MIT。桌面/木质承托/搪瓷槽/玻璃与球由本项目绘制，不含抓大鹅素材、商标、鹅形象或未知字体。

v0.1.13：首页标题使用本项目原创Canvas笔画路径，无新增商业字体；卡通眼睛与微动由程序绘制。两张背景PNG由 `scripts/make-tabletop-backgrounds.py` 原创生成，增加窗台/植物/木纹边缘装饰，无第三方图像素材。音频未改动。

v0.1.15：轨道玩具、标题圆球与轨道笔画、磨砂玻璃均为原创Canvas程序绘制，未引入外部图像、字体或音频；背景图片和音乐沿用现有原创资源。
