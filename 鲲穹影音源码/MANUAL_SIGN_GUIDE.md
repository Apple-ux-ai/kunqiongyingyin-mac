# 手动签名与打包指南 (Manual Code Signing Guide)
<!-- 功能: 手动签名流程说明文档 -->
<!-- 作者: FullStack-Guardian -->
<!-- 更新时间: 2026-03-07 -->

本文档指导如何将构建过程拆分为“生成文件”和“打包安装程序”两个步骤，以便在中间插入手动代码签名环节。

## 流程概览

1.  **Step 1**: 生成未打包的可执行文件（解压态）。
2.  **Manual**: 手动对 `.exe` 和 `.dll` 进行签名。
3.  **Step 2**: 将签名后的文件打包成最终安装程序（Setup.exe）。

---

## 详细步骤

### 第一步：生成待签名文件 (Step 1)

运行以下命令，构建项目并将结果输出到 `dist-pending-sign` 目录：

```bash
npm run build:step1-unpack
```

**产物位置**：
*   `dist-pending-sign/win-unpacked/`
    *   `鲲穹影音.exe` (主程序)
    *   `resources/`
    *   ...以及其他依赖文件

### 第二步：手动签名 (Manual Action)

在此阶段，请使用你的签名工具（如 signtool, ksign 等）对 `dist-pending-sign/win-unpacked` 目录下的关键文件进行签名。

**建议签名的文件**：
1.  `dist-pending-sign/win-unpacked/鲲穹影音.exe` (必须)
2.  `dist-pending-sign/win-unpacked/resources/elevate.exe` (提权工具，建议)
3.  `dist-pending-sign/win-unpacked/ffmpeg.dll` (可选)
4.  `dist-pending-sign/win-unpacked/resources/ffmpeg/ffmpeg.exe` (可选)

> **注意**：
> *   请勿修改文件夹结构或文件名。
> *   请勿删除任何文件。
> *   确保签名后的文件仍然可以正常运行（建议双击 `鲲穹影音.exe` 测试一下）。

### 第三步：打包安装程序 (Step 2)

确认签名完成后，运行以下命令生成最终安装包：

```bash
npm run build:step2-pack
```

**产物位置**：
*   `dist-signed-release/`
    *   `鲲穹影音 Setup 1.1.1.exe` (最终分发包)

> **重要提示**：此时生成的 Setup.exe 本身尚未签名（尽管它包含的内部文件已签名）。

### 第四步：对安装包签名 (Final Sign)

为了防止 Windows SmartScreen 拦截安装包，你需要对最终生成的安装包进行签名。

请使用你的签名工具，对以下文件进行最后一次签名：
*   `dist-signed-release/鲲穹影音 Setup 1.1.1.exe`

**签名完成后，这就是最终可分发的版本。**

---

## 常见问题

**Q: 为什么 Step 2 很快？**
A: 因为 Step 2 跳过了编译和构建步骤，直接将 Step 1 生成的文件夹压缩成 NSIS 安装包，所以速度很快。

**Q: 如果修改了代码，需要重新跑 Step 1 吗？**
A: 是的。如果修改了源码，必须重新运行 `npm run build:step1-unpack`，然后重新签名，最后再运行 `npm run build:step2-pack`。

**Q: 版本号在哪里修改？**
A: 在 `package.json` 中的 `version` 字段。请确保在 Step 1 和 Step 2 之间不要修改版本号。
