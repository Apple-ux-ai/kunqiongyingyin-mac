# CHANGELOG

## [1.0.1] - 2026-01-30
### Fixed
- 修复在线视频无法显示文件大小的问题（通过 HEAD 请求获取 content-length）。
- 修复画面比例 (16:9 / 4:3) 调节无效的问题（通过动态计算 video 标签尺寸强制拉伸）。
- 修复设置记忆功能，现在支持保存并恢复用户选择的画面比例。

### Added
- 新增 `pack.bat` 一键打包脚本。
- 新增 GitHub Actions 自动化构建配置 `.github/workflows/build.yml`。
- 新增 `DELIVER.md` 交付文档。

### Optimized
- 优化了视频加载后的尺寸刷新逻辑。
- 完善了 electron-builder 的 `files` 排除规则，减小安装包体积。
