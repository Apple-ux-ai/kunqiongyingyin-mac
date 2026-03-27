# 问题记录与决策

| 编号 | 问题描述 | 影响范围 | 可选方案 | 推荐方案 | 决策内容 | 状态 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 001 | .mpe 格式未识别 | 文件选择、播放列表添加 | 在 main.js, script.js, decoder.js, index.html 中添加 mpe 扩展名 | 同可选方案 | 将 mpe 加入视频文件过滤器和强制转码白名单 | 已解决 |
| 002 | 视频切换/解码时缺乏状态提示 | 用户体验、加载等待过程 | 修改 showLoading 支持自定义文字；在 loadVideo 不同阶段显示“正在加载...”和“正在解码...” | 同可选方案 | 增强 UIManager 和 script.js 的加载提示逻辑 | 已解决 |
| 003 | 视频加载时用户重复点击导致异常 | 播放器稳定性、资源浪费 | 在 loadVideo 中添加 isLoadingVideo 状态锁，防止在加载完成前再次触发 | 同可选方案 | 在 loadVideo 函数入口添加状态检查，finally 块重置状态 | 已解决 |
| 004 | 重新打包时 Access is denied | 部署、分发 | 更改 package.json 中的输出目录 | 同可选方案 | 将输出目录更改为 dist-v2/dist-v3 以解决文件锁定问题 | 已解决 |
| 005 | mpe/gif/ts/m2ts 等格式加载界面显示不正常或被过早隐藏 | 转码格式的加载过程 | 引入 isTranscoding 和 isLoadingVideo 状态双重检查；优化 loadVideo 预判逻辑 | 同可选方案 | 在 onVideoLoaded 和 canPlayHandler 中增加状态检查，防止旧视频事件意外关闭加载界面 | 已解决 |
| 006 | 扩展视频格式支持 (m2p, mpg, m4v, vob, m2v, asx, f4v) | 文件选择、播放列表、转码 | 在 main.js, decoder.js, index.html, script.js 中同步添加这些格式 | 同可选方案 | 确保用户能够选择并播放所有请求的格式 | 已解决 |
