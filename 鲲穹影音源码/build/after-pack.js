/**
 * macOS：将当前构建架构对应的 FFmpeg/FFprobe 复制到 .app 的 Resources/ffmpeg/darwin-{arch}/。
 * universal 合并前会对 arm64、x64 各执行一次 afterPack，因此两套二进制都会落入最终包内。
 */
const fs = require('fs');
const path = require('path');

function findAppBundle(appOutDir) {
    const entries = fs.readdirSync(appOutDir, { withFileTypes: true });
    const app = entries.find((e) => e.isDirectory() && e.name.endsWith('.app'));
    return app ? path.join(appOutDir, app.name) : null;
}

async function copyBinary(src, dest) {
    await fs.promises.mkdir(path.dirname(dest), { recursive: true });
    await fs.promises.copyFile(src, dest);
    try {
        await fs.promises.chmod(dest, 0o755);
    } catch (_) {
        /* ignore */
    }
}

async function copyDarwinFfmpegSet(resourcesDir, nodeModulesRoot, darwinFolder) {
    const ffmpegSrc = path.join(nodeModulesRoot, '@ffmpeg-installer', darwinFolder, 'ffmpeg');
    const ffprobeSrc = path.join(nodeModulesRoot, '@ffprobe-installer', darwinFolder, 'ffprobe');
    const base = path.join(resourcesDir, 'ffmpeg', darwinFolder);

    if (fs.existsSync(ffmpegSrc)) {
        await copyBinary(ffmpegSrc, path.join(base, 'ffmpeg'));
    } else {
        console.warn(`[after-pack] 未找到 ${ffmpegSrc}，请在本机构建机上执行 npm install 并确保已安装 ${darwinFolder} 对应可选依赖`);
    }
    if (fs.existsSync(ffprobeSrc)) {
        await copyBinary(ffprobeSrc, path.join(base, 'ffprobe'));
    } else {
        console.warn(`[after-pack] 未找到 ${ffprobeSrc}`);
    }
}

module.exports = async (context) => {
    if (context.electronPlatformName !== 'darwin') {
        return;
    }

    const appBundle = findAppBundle(context.appOutDir);
    if (!appBundle) {
        console.warn('[after-pack] 未在 appOutDir 中发现 .app，跳过 FFmpeg 复制');
        return;
    }

    const resourcesDir = path.join(appBundle, 'Contents', 'Resources');
    const nodeModulesRoot = path.join(__dirname, '..', 'node_modules');
    const arch = context.arch;

    if (arch === 'universal') {
        await copyDarwinFfmpegSet(resourcesDir, nodeModulesRoot, 'darwin-arm64');
        await copyDarwinFfmpegSet(resourcesDir, nodeModulesRoot, 'darwin-x64');
        return;
    }

    if (arch === 'arm64') {
        await copyDarwinFfmpegSet(resourcesDir, nodeModulesRoot, 'darwin-arm64');
        return;
    }

    if (arch === 'x64') {
        await copyDarwinFfmpegSet(resourcesDir, nodeModulesRoot, 'darwin-x64');
        return;
    }

    console.warn(`[after-pack] 未处理的 arch=${arch}，跳过 FFmpeg 复制`);
};
