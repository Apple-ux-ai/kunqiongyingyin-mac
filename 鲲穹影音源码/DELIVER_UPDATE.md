# 更新功能交付清单

## 1. 产物列表
| 文件 | 路径 | 说明 |
|------|------|------|
| **1.0.0 安装包** | `鲲穹AI播放器源码\dist-v113-ultimate\鲲穹影音专业版V113 Setup 1.0.0.exe` | 初始版本，已集成更新检测 |
| **1.0.8 更新包** | `鲲穹AI播放器源码\update_1.0.8.zip` | 增量更新包，包含新版核心文件 |
| **Updater 组件** | `鲲穹AI播放器源码\bin\updater.exe` | 独立更新程序 |

## 2. 验证流程 (本地模拟)

由于服务器环境可能未部署，你可以使用以下命令在本地模拟更新过程：

### 第一步：安装旧版本
运行 `鲲穹影音专业版V113 Setup 1.0.0.exe` 并安装。

### 第二步：模拟服务器更新
打开终端 (PowerShell)，手动运行 `updater.exe` 来测试更新包是否能正确覆盖。

```powershell
# 假设安装目录在 C:\Users\你的用户名\AppData\Local\Programs\kunqiong-ai-player
# 请根据实际安装位置调整

$InstallDir = "$env:LOCALAPPDATA\Programs\kunqiong-ai-player"
$UpdaterPath = "$InstallDir\resources\updater.exe"
$ZipPath = "d:\鲲穹AI播放器3\鲲穹AI播放器源码\update_1.0.8.zip"

# 模拟调用
& $UpdaterPath --zip "$ZipPath" --dir "$InstallDir" --exe "鲲穹影音专业版V113.exe"
```

**预期结果**：
1. 出现更新进度条。
2. 自动解压 `update_1.0.8.zip`。
3. `resources\app.asar` 被替换。
4. 播放器自动重启。
5. 查看播放器窗口标题或关于页面，版本应变为 `1.0.8`。

## 3. 部署说明
将 `update_1.0.8.zip` 上传至服务器，并在 API 响应中配置其 URL 和 Hash 即可启用线上更新。
