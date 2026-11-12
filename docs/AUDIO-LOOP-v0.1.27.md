# v0.1.27 微信内存循环播放

## 为什么继续修改

v0.1.26 消除了音乐文件末尾的44ms全静音，但仍使用 `InnerAudioContext.loop`。用户确认体验版依然有周期性间断，说明仅修改素材不够。原生文件播放器的循环行为不等于采样连续播放。

本版改用 `wx.createWebAudioContext`：从代码包读取现有WAV，解码一次，创建一个 `BufferSourceNode`，设置 `loop = true`、`loopStart = 0`、`loopEnd = buffer.duration`。音乐在音频线程中循环同一段内存，不在32秒结束时重新加载文件或调用 `play()`，也不通过 `onended` 或JavaScript计时器接力。

音乐仍为原有32秒、135BPM原创曲，默认音量0.22。未更改音乐素材、背景、标题、画面、玩法或难度。

## 声音与生命周期

- 游戏声音开关、首页/局内允许播放阶段保持原规则。
- 暂停、广告、后台、结算与系统音频中断立即将增益归零、停止并断开音源，不等待异步 `suspend()` 返回。
- 恢复时按音频时钟记录的循环内位置继续，复用已解码缓冲区；只创建恢复需要的新音源，不叠加播放。
- 每次请求带有序号。取消后的读取、解码、恢复回调与旧音源结束回调不能重新发声。
- `resume()` 在触摸调用链中同步发起。读取、解码和启动有5秒保护，避免未完成的异步操作让声音永久卡住。

## 兼容回退与物理静音键

旧基础库没有所需API，或创建、读取、解码、恢复、启动失败时，会关闭内存播放路径并退回原有 `InnerAudioContext`。回退仍受游戏静音及生命周期限制，控制台会记录 `TriCollect ... using native loop`。**兼容回退仍可能保留原生循环间隙，不能把回退也称为无缝循环。**

取球音效继续使用原生播放器，并保留已有的全局/实例静音键配置。官方目前明确说明 `setInnerAudioOption` 不兼容WebAudio，所以本版**不保证iPhone物理静音键开启时背景音乐仍发声**，也不能用“音源时钟在走”判断手机实际可听见声音。若背景音乐无声，应先关闭物理静音键并检查媒体音量，再记录设备/微信/基础库版本。游戏自己的“静音”开关始终有效。

官方接口来源：

- [BufferSourceNode](https://developers.weixin.qq.com/minigame/dev/api/media/audio/BufferSourceNode.html)
- [createWebAudioContext](https://developers.weixin.qq.com/minigame/dev/api/media/audio/wx.createWebAudioContext.html)
- [setInnerAudioOption](https://developers.weixin.qq.com/minigame/dev/api/media/audio/wx.setInnerAudioOption.html)
- [微信官方类型声明](https://github.com/wechat-miniprogram/minigame-api-typings/blob/master/types/wx/lib.wx.api.d.ts)

2026-11-12 已读取官方类型声明核对上述API与限制；官方文档网站本次访问失败。源码使用项目锁定的3.8.21声明，并仅调用已文档化的WebAudio子集。

## 验证范围

最终全量186项测试、300种子验证、两端构建、类型检查、格式检查与独立代码复核通过。

新增测试覆盖单次解码、100秒期间不重启音源、循环内位置恢复、前后台/静音/暂停/广告/系统中断、过期回调、快速取消重试、API失败、异常结束、挂起的恢复Promise和超时回退。预构建微信入口另行验证32/64/96秒边界及真实游戏按钮/生命周期的接线。

`npm run test:audio:buffer` 使用独立的 `web-audio-engine` 离线音频实现运行生产 `BufferedMusic`，实际生成100秒、2205000个PCM采样。全程只创建一个音源、只解码一次，逐采样对照循环波形，浮点最大误差约3.58e-9；32/64/96秒接缝未插入静音。原PCM转换差异在1个16位采样量化单位以内。详见 `evidence/v0.1.27-audio-offline.json`。

该离线引擎只用于测试，不打入小游戏运行包。它不是微信或浏览器，**上述结果不等于真机听测**。本机Chromium启动被宿主socket权限限制阻断，未执行浏览器播放测试；微信开发者工具、iOS/Android体验版和人工试听仍待验证。完整检查状态见 `evidence/v0.1.27-validation.json`。

## 体验版检查

1. 用最新 `dist/wechat` 重新上传体验版，保留自己的AppID与广告配置。
2. 首页从实际发声起试听至少100秒，检查32、64、96秒处，游戏中再试听一次。
3. 检查游戏静音、暂停继续、前后台、系统音频中断与广告期间无叠音或自行解除静音。
4. iPhone分别核对物理静音键开/关，Android核对媒体音量与后台返回。如果仍有间隔，记录版本、间隔时长及是否出现原生回退警告。
