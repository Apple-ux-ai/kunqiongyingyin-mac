# 更新包功能实现计划

## 实施背景
为了替换原有的 `electron-updater` 逻辑，改用项目提供的通用更新组件 `updater.exe`，实现更灵活的自定义更新流程。

## 实施检查清单
1. [x] **准备工作**：创建 `bin` 目录并将 `updater.exe` 复制到该目录下。
2. [x] **配置修改**：在 `package.json` 中配置 `extraResources`，确保打包时 `updater.exe` 被包含在资源目录中。
3. [x] **核心实现**：重写 `update-manager.js`。
    - 使用 `fetch` 请求自定义更新 API：`http://software.kunqiongai.com:8000/api/v1/updates/check/`。
    - 解析响应并提示用户更新。
    - 调用 `updater.exe` 执行下载、校验、解压、覆盖及重启逻辑。
4. [x] **测试包生成**：生成 1.0.1 版本的 ZIP 测试更新包并计算 SHA256 哈希值。

## 技术规格
- **API 地址**: `http://software.kunqiongai.com:8000/api/v1/updates/check/`
- **软件标识符**: `kunqiong-ai-player`
- **更新组件路径**: 
    - 开发环境: `./bin/updater.exe`
    - 生产环境: `process.resourcesPath/updater.exe`
- **更新参数**:
    - `--url`: 更新包下载地址
    - `--hash`: 更新包 SHA256 校验值
    - `--dir`: 安装目录
    - `--exe`: 主程序名
    - `--pid`: 当前进程 PID

## 最终动作
- 完成代码编写与配置。
- 提供测试包 `update_1.0.1.zip` 及其哈希值。
