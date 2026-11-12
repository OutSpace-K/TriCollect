# 资源与第三方依赖

- 项目源代码：本包 `LICENSE`（MIT）。
- 当前背景PNG来源见文末v0.1.22条目；以下为历史资源说明。画面：程序绘制管体、渐变和彩球；`assets/background.png` 为本项目原创程序绘制陈列场景背景（拱形空间、台面、光束与光粒），无外部图片、采样或美术素材，按 MIT 随工程提供。重制脚本为 `scripts/make-background.py`，Pillow仅作为离线生成工具，不随游戏运行包分发。
- 字体：系统 sans-serif，不分发字体文件。图形使用 Unicode 符号与数字；需真机检查字体覆盖。
- `assets/tap.wav`：项目内数学正弦波与衰减合成，生成逻辑见 `scripts/make-audio.py`，无采样外部音乐，按 MIT 随工程提供。
- `assets/ambience.wav`：本项目原创32秒、135BPM休闲益智合成曲（v0.1.7轻拨弦回应、轻鼓与较弱低音编配），纯数学谐波、衰减包络、原创旋律/低音/和弦及确定性噪声打击乐，无外部采样、录音或导入旋律；生成脚本同为 `scripts/make-audio.py`，按 MIT 随工程提供。
- 构建/测试依赖：TypeScript（Apache-2.0）、esbuild（MIT）、tsx（MIT）、Prettier（MIT）、playwright-core（Apache-2.0）、@types/node（MIT）、minigame-api-typings（MIT）。具体版本与传递依赖以 `package-lock.json` 为准；第三方 license 原文打包到 `docs/third-party`。
- 不分发 Chromium 浏览器；交互测试调用用户本机安装版本。
- v0.1.27 增加测试依赖 `web-audio-engine@0.13.4`（MIT）及其MIT传递依赖，用于离线音频渲染。版本锁定于 `package-lock.json`；源码包不分发其 `node_modules`，小游戏运行包不包含该引擎。上游：https://github.com/mohayonao/web-audio-engine 。

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

## v0.1.16 增量素材

标题“转”由系统sans-serif的900粗体填充绘制，不分发字体；“个”和圆形轮廓“球”为项目内Canvas路径。瓶塞、薄玻璃高光、加厚托盘及错落跑道均为程序绘制，无外部美术素材。背景图片和原创音频沿用。

## v0.1.17 增量素材

首页三个字均改为本项目定制Canvas笔画路径，替代v016首字的系统字体方案；普通界面文字仍用系统字体。不分发字体文件。发条鸭、火车、蜗牛、飞机、兔子为原创程序绘制小玩具，无外部图片、字体图标或第三方角色素材。五色瓶盖和乳白淡紫磨砂材质均程序绘制。背景与音乐沿用原资源。

## v0.1.18 增量绘制

艺术字黑描边、竖轴字挤出层与琥珀棱纹遮挡均由项目内Canvas路径和渐变绘制，无外部字体、美术或音频。五类原创玩具沿用，修改轨迹和朝向。音乐资源未变。背景更新为 `scripts/make-showroom-backgrounds.py` 原创程序绘制的货架/饮料瓶/蓝桌/地砖PNG，按项目MIT许可；Pillow仅离线生成使用。图示玩法和有限彩纸由Canvas原创绘制，无第三方图像、商业字体或参考游戏资产。

## v0.1.22 生成式背景改绘与标题

两张背景以本项目v0.1.18原创程序图为基础，由ImageGen改绘瓶内彩球，并缩放至600×1040。生成参考仅为本项目原图及此次首页改绘图，未将第三方游戏画面输入背景编辑。生成原图与发布资产哈希记录在 assets/background-provenance.json。历史脚本不能精确复现新PNG；工程可直接构建附带的资产。标题继续由本项目原创Canvas路径绘制，参考页面仅提炼通用字体材质和层级，不分发第三方字体、商标或角色。音乐未改动。
