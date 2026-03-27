# 鲲穹影音 交付清单 (Handover List)

## 1. 一键打包命令
您可以直接在源码目录下运行以下脚本进行本地打包：
- **Windows**: 双击运行 `pack.bat`
- **命令行**: `npm run build`

## 2. 产物说明
打包后的产物将存放在 `dist-v9/` 目录下：
- `鲲穹影音 Setup 1.0.1.exe`: 标准 Windows 安装程序。
- `win-unpacked/`: 免安装版本（便携版），可直接运行其中的 `鲲穹影音.exe`。

## 3. 版本号规则
- 遵循 **Semantic Versioning (SemVer)**。
- 当前版本：`1.0.1`。
- 修改版本号请前往 `package.json` 中的 `"version"` 字段。

## 4. 自动化构建 (CI/CD)
已配置 GitHub Actions。当您向仓库推送以 `v` 开头的标签（如 `v1.0.1`）时，系统会自动：
1. 启动 Windows 环境虚拟机。
2. 安装依赖并执行打包。
3. 自动生成 GitHub Release 草稿并上传 `.exe` 安装包。

## 5. 常见打包错误排查
| 错误现象 | 可能原因 | 解决方法 |
| :--- | :--- | :--- |
| `FFmpeg path not found` | `node_modules` 损坏 | 运行 `npm install` 重新安装依赖 |
| 打包速度极慢 | 文件扫描过多 | 检查 `package.json` 中的 `files` 排除项 |
| 安装后无法播放特殊格式 | FFmpeg 未正确打包 | 检查 `extraResources` 配置及 `decoder.js` 路径 |

---
**交付完成！后续同类需求直接 @FullStack-Guardian。祝发布顺利 🎉**
