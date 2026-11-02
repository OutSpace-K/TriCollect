# 好友排名现状与真实接入条件

v0.1.13 没有好友排行榜；只有本机战绩。代码中未创建开放数据域、未调用微信好友云存储，也没有服务端账户系统。默认 `project.config.json` 使用游客占位，`config/platform.example.json` 的 appId 为空。没有伪造好友、测试排名或不可用入口。

后续真实接入需要小游戏 AppID 与对应开发/体验/发布环境账号权限，配置开放数据域，主域将经过校验的成绩以 `wx.setUserCloudStorage` 写入微信托管数据。开放数据域在用户授权后调用 `wx.getFriendCloudStorage` 获取同玩好友数据，自行绘制到 sharedCanvas；主域仅显示共享画布，不读取好友私有数据。需要区分难度、规则版本和排行榜周期，不能混合不同球量的原始分数。

必须实际验证：无授权/拒绝授权、无好友/空数据、网络失败、发布态与体验态账号条件、好友双方确实玩过并写入成绩、重入不重复上传、共享画布尺寸/触摸/生命周期。授权失败不影响单人游戏。本地分数不是防作弊服务，正式竞争榜需另行设计可信校验。

接口依据：[微信 getFriendCloudStorage](https://developers.weixin.qq.com/minigame/dev/api/open-api/data/wx.getFriendCloudStorage.html)、[setUserCloudStorage](https://developers.weixin.qq.com/minigame/dev/api/open-api/data/wx.setUserCloudStorage.html)。本次网页直接抓取失败，交叉核对官方 `minigame-api-typings@3.8.21` 的 `types/wx/lib.wx.api.d.ts`：前者明确仅开放数据域可用且需用户授权，后者基础库1.9.92起支持。类型声明不能代替实际账号、工具与真机验收。本版没有声称这些接口已经运行。
