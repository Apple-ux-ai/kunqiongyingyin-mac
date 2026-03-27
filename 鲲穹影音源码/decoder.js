// 视频解码模块 - 支持多种解码器和硬件加速
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { app } = require('electron');
const logger = require('./logger');

function darwinFfmpegSubdir() {
    return process.arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64';
}

function ensureExecutableMac(p) {
    if (process.platform === 'darwin' && fs.existsSync(p)) {
        try {
            fs.chmodSync(p, 0o755);
        } catch (e) {
            /* ignore */
        }
    }
}

// 获取FFmpeg路径（支持开发环境和打包环境）
function getFFmpegPath() {
    if (app.isPackaged) {
        const resourcesPath = process.resourcesPath;
        if (process.platform === 'win32') {
            const p = path.join(resourcesPath, 'ffmpeg', 'ffmpeg.exe');
            if (fs.existsSync(p)) {
                return p;
            }
        } else if (process.platform === 'darwin') {
            const p = path.join(resourcesPath, 'ffmpeg', darwinFfmpegSubdir(), 'ffmpeg');
            if (fs.existsSync(p)) {
                ensureExecutableMac(p);
                return p;
            }
        }
    }

    try {
        return require('@ffmpeg-installer/ffmpeg').path;
    } catch (err) {
        const nm = path.join(__dirname, 'node_modules');
        const possiblePaths = [
            path.join(nm, '@ffmpeg-installer', 'win32-x64', 'ffmpeg.exe'),
            path.join(nm, '@ffmpeg-installer', 'darwin-arm64', 'ffmpeg'),
            path.join(nm, '@ffmpeg-installer', 'darwin-x64', 'ffmpeg')
        ];
        if (process.resourcesPath) {
            possiblePaths.push(
                path.join(process.resourcesPath, '..', 'app.asar.unpacked', 'node_modules', '@ffmpeg-installer', 'win32-x64', 'ffmpeg.exe')
            );
        }
        for (const possiblePath of possiblePaths) {
            if (fs.existsSync(possiblePath)) {
                ensureExecutableMac(possiblePath);
                return possiblePath;
            }
        }
        throw new Error('无法找到FFmpeg可执行文件');
    }
}

// 获取FFprobe路径（支持开发环境和打包环境）
function getFFprobePath() {
    if (app.isPackaged) {
        const resourcesPath = process.resourcesPath;
        if (process.platform === 'win32') {
            const p = path.join(resourcesPath, 'ffmpeg', 'ffprobe.exe');
            if (fs.existsSync(p)) {
                return p;
            }
        } else if (process.platform === 'darwin') {
            const p = path.join(resourcesPath, 'ffmpeg', darwinFfmpegSubdir(), 'ffprobe');
            if (fs.existsSync(p)) {
                ensureExecutableMac(p);
                return p;
            }
        }
    }

    try {
        return require('@ffprobe-installer/ffprobe').path;
    } catch (err) {
        const nm = path.join(__dirname, 'node_modules');
        const possiblePaths = [
            path.join(nm, '@ffprobe-installer', 'win32-x64', 'ffprobe.exe'),
            path.join(nm, '@ffprobe-installer', 'darwin-arm64', 'ffprobe'),
            path.join(nm, '@ffprobe-installer', 'darwin-x64', 'ffprobe')
        ];
        if (process.resourcesPath) {
            possiblePaths.push(
                path.join(process.resourcesPath, '..', 'app.asar.unpacked', 'node_modules', '@ffprobe-installer', 'win32-x64', 'ffprobe.exe')
            );
        }
        for (const possiblePath of possiblePaths) {
            if (fs.existsSync(possiblePath)) {
                ensureExecutableMac(possiblePath);
                return possiblePath;
            }
        }
        throw new Error('无法找到FFprobe可执行文件');
    }
}

// 设置FFmpeg路径
const ffmpegPath = getFFmpegPath();
const ffprobePath = getFFprobePath();

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

// 延迟记录日志（等logger初始化）
setTimeout(() => {
    logger.info(`应用打包状态: ${app.isPackaged ? '已打包' : '开发模式'}`);
    logger.info(`FFmpeg路径: ${ffmpegPath}`);
    logger.info(`FFprobe路径: ${ffprobePath}`);
    logger.info(`资源路径: ${process.resourcesPath || 'N/A'}`);
}, 100);

class VideoDecoder {
    constructor() {
        // 默认配置
        this.config = {
            splitter: 'auto',           // 分离器
            videoDecoder: 'auto',       // 视频解码器
            audioDecoder: 'auto',       // 音频解码器
            renderer: 'auto',           // 渲染器
            playbackCore: 'ffmpeg',     // 播放核心
            hardwareAccel: false        // 硬件加速
        };
        
        // 临时文件目录
        this.tempDir = path.join(app.getPath('temp'), 'kunqiong-player');
        this.ensureTempDir();
    }
    
    // 确保临时目录存在
    ensureTempDir() {
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }
    
    // 更新解码器配置
    updateConfig(config) {
        this.config = { ...this.config, ...config };
        logger.logDecoderConfig(this.config);
        console.log('解码器配置已更新:', this.config);
    }
    
    // 获取视频信息
    async getVideoInfo(filePath) {
        logger.info(`FFprobe检测视频: ${filePath}`);
        return new Promise((resolve, reject) => {
            ffmpeg.ffprobe(filePath, (err, metadata) => {
                if (err) {
                    logger.error(`FFprobe检测失败: ${filePath}`, err);
                    reject(err);
                    return;
                }
                
                const videoStream = metadata.streams.find(s => s.codec_type === 'video');
                const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
                // 安全解析 ffprobe 的 r_frame_rate（如 "30/1"、"24000/1001"），避免使用 eval
                const fps = videoStream && videoStream.r_frame_rate
                    ? (() => {
                        const parts = String(videoStream.r_frame_rate).split('/').map(Number);
                        if (parts.length === 2 && parts[0] && parts[1]) return parts[0] / parts[1];
                        const n = parseFloat(videoStream.r_frame_rate);
                        return Number.isFinite(n) ? n : undefined;
                    })()
                    : undefined;

                resolve({
                    duration: metadata.format.duration,
                    size: metadata.format.size,
                    bitrate: metadata.format.bit_rate,
                    format: metadata.format.format_name,
                    video: videoStream ? {
                        codec: videoStream.codec_name,
                        width: videoStream.width,
                        height: videoStream.height,
                        fps,
                        bitrate: videoStream.bit_rate,
                        pixelFormat: videoStream.pix_fmt
                    } : null,
                    audio: audioStream ? {
                        codec: audioStream.codec_name,
                        sampleRate: audioStream.sample_rate,
                        channels: audioStream.channels,
                        bitrate: audioStream.bit_rate
                    } : null
                });
            });
        });
    }
    
    // 根据输入路径生成稳定缓存 key（同一文件再次播放可复用）
    getCacheKey(inputPath) {
        const normalized = path.resolve(path.normalize(String(inputPath)));
        return crypto.createHash('md5').update(normalized).digest('hex');
    }

    getCachePath(inputPath) {
        return path.join(this.tempDir, `cached_${this.getCacheKey(inputPath)}.mp4`);
    }

    // 若该文件已有解码缓存则返回缓存路径，否则返回 null
    getCachedOutputPath(inputPath) {
        const cachePath = this.getCachePath(inputPath);
        if (fs.existsSync(cachePath)) {
            logger.info(`命中解码缓存: ${cachePath}`);
            return cachePath;
        }
        return null;
    }

    // 转码视频（用于不支持的格式或需要特定解码器）；同一文件再次播放使用缓存，无需重复解码
    async transcodeVideo(inputPath, options = {}) {
        logger.info(`转码函数被调用: ${inputPath}`);

        const cachePath = this.getCachePath(inputPath);
        if (fs.existsSync(cachePath)) {
            logger.info(`使用缓存的解码文件: ${cachePath}`);
            return { outputPath: cachePath, fromCache: true };
        }

        const outputPath = cachePath;
        logger.info(`转码输出路径: ${outputPath}`);

        return new Promise(async (resolve, reject) => {
            logger.info('开始创建FFmpeg命令...');

            // 先检测是否有音频轨道
            let hasAudio = true;
            try {
                const info = await this.getVideoInfo(inputPath);
                hasAudio = !!info.audio;
                logger.info(`检测到音频轨道: ${hasAudio}`);
            } catch (err) {
                logger.warn('无法检测音频轨道，假定有音频');
            }
            
            let command = ffmpeg(inputPath);
            
            // 视频解码器设置
            if (this.config.videoDecoder !== 'auto') {
                command = this.applyVideoDecoder(command);
            }
            
            // 音频解码器设置
            if (this.config.audioDecoder !== 'auto') {
                command = this.applyAudioDecoder(command);
            }
            
            // 硬件加速设置
            if (this.config.hardwareAccel || this.config.videoDecoder === 'dxva') {
                command = this.applyHardwareAccel(command);
            }
            
            // 构建输出选项
            const outputOptions = [
                '-preset ultrafast',     // 最快编码速度
                '-crf 23',              // 质量设置
                '-movflags +faststart', // Web优化
                '-pix_fmt yuv420p',     // 确保兼容性，这对MOV很重要
                '-strict experimental'   // 允许实验性编解码器
            ];
            
            // 基础输出设置
            command = command
                .output(outputPath)
                .videoCodec('libx264');
            
            // 音频处理
            if (hasAudio) {
                // 有音频轨道，转码音频
                logger.info('检测到音频轨道，进行音频转码');
                command = command
                    .audioCodec('aac')
                    .audioFrequency(44100)
                    .audioChannels(2)
                    .audioBitrate('128k');
            } else {
                // 没有音频轨道，尝试不添加音频（简化处理）
                logger.info('未检测到音频轨道，不添加音频');
                command = command.noAudio();
            }
            
            // 应用输出选项
            command = command.outputOptions(outputOptions);
            
            command
                .on('start', (commandLine) => {
                    logger.info(`FFmpeg命令: ${commandLine}`);
                    console.log('FFmpeg命令:', commandLine);
                })
                .on('progress', (progress) => {
                    const percent = progress.percent ? progress.percent.toFixed(2) : 0;
                    logger.debug(`转码进度: ${percent}%`);
                    console.log(`转码进度: ${percent}%`);
                })
                .on('end', () => {
                    logger.info(`转码完成并已写入缓存: ${outputPath}`);
                    console.log('转码完成:', outputPath);
                    resolve({ outputPath, fromCache: false });
                })
                .on('error', (err) => {
                    logger.error('转码失败', err);
                    console.error('转码失败:', err);
                    reject(err);
                })
                .run();
        });
    }
    
    // 应用视频解码器
    applyVideoDecoder(command) {
        const decoderMap = {
            'h264': '-c:v h264',
            'h265': '-c:v hevc',
            'ffmpeg': '-c:v copy',
            'dxva': '-hwaccel dxva2'
        };
        
        const decoder = decoderMap[this.config.videoDecoder];
        if (decoder) {
            command.inputOptions([decoder]);
        }
        
        return command;
    }
    
    // 应用音频解码器
    applyAudioDecoder(command) {
        const decoderMap = {
            'aac': '-c:a aac',
            'mp3': '-c:a mp3',
            'ac3': '-c:a ac3',
            'dts': '-c:a dts',
            'ffmpeg': '-c:a copy'
        };
        
        const decoder = decoderMap[this.config.audioDecoder];
        if (decoder) {
            command.inputOptions([decoder]);
        }
        
        return command;
    }
    
    // 应用硬件加速
    applyHardwareAccel(command) {
        // Windows DXVA2 硬件加速
        if (process.platform === 'win32') {
            command.inputOptions([
                '-hwaccel dxva2',
                '-hwaccel_output_format dxva2_vld'
            ]);
        }
        // Linux VAAPI 硬件加速
        else if (process.platform === 'linux') {
            command.inputOptions([
                '-hwaccel vaapi',
                '-hwaccel_device /dev/dri/renderD128',
                '-hwaccel_output_format vaapi'
            ]);
        }
        // macOS VideoToolbox 硬件加速
        else if (process.platform === 'darwin') {
            command.inputOptions([
                '-hwaccel videotoolbox'
            ]);
        }
        
        return command;
    }
    
    // 提取视频流
    async extractVideoStream(inputPath) {
        const outputPath = path.join(
            this.tempDir,
            `video_${Date.now()}.mp4`
        );
        
        return new Promise((resolve, reject) => {
            ffmpeg(inputPath)
                .noAudio()
                .videoCodec('copy')
                .output(outputPath)
                .on('end', () => resolve(outputPath))
                .on('error', reject)
                .run();
        });
    }
    
    // 提取音频流
    async extractAudioStream(inputPath) {
        const outputPath = path.join(
            this.tempDir,
            `audio_${Date.now()}.mp3`
        );
        
        return new Promise((resolve, reject) => {
            ffmpeg(inputPath)
                .noVideo()
                .audioCodec('libmp3lame')
                .output(outputPath)
                .on('end', () => resolve(outputPath))
                .on('error', reject)
                .run();
        });
    }
    
    // 清理临时文件
    cleanupTempFiles() {
        if (fs.existsSync(this.tempDir)) {
            const files = fs.readdirSync(this.tempDir);
            files.forEach(file => {
                const filePath = path.join(this.tempDir, file);
                try {
                    fs.unlinkSync(filePath);
                } catch (err) {
                    console.error('删除临时文件失败:', err);
                }
            });
        }
    }
    
    async needsTranscode(filePath) {
        try {
            const ext = path.extname(filePath).toLowerCase();
            const forceExts = ['.avi', '.m2ts', '.mts', '.m2t', '.3gp', '.wmv', '.ts', '.flv', '.gif', '.rm', '.rmvb', '.mpe', '.m2p', '.mpg', '.m4v', '.vob', '.m2v', '.asx', '.f4v'];
            if (forceExts.includes(ext)) {
                logger.info(`根据扩展名强制转码: ${ext}`);
                return true;
            }
            
            const info = await this.getVideoInfo(filePath);
            
            // 检查是否为不常见的编码格式或需要转码的格式
            // 包含 mpeg1video 和 mpeg2video，因为HTML5 video对MPEG支持不完整
            const uncommonCodecs = [
                'mpeg1video',    // MPEG-1 格式，浏览器支持有限
                'mpeg2video',    // MPEG-2 格式，需要转码
                'vp9',           // VP9，部分浏览器不支持
                'av1',           // AV1，需要新浏览器
                'wmv',           // Windows Media Video
                'wmv3',          // WMV3
                'flv',           // Flash Video
                'flv1',          // FLV1
                'rm',            // RealMedia
                'rmvb',          // RMVB
                'rv40',          // RealVideo 4.0
                // MOV/QuickTime 特定编解码器
                'prores',        // Apple ProRes
                'dvvideo',       // DV Video
                'svq1',          // Sorenson Video 1
                'svq3',          // Sorenson Video 3
                'cinepak',       // Cinepak
                'rpza',          // Apple Video
                'qtrle',         // QuickTime Animation
                'mjpeg',         // Motion JPEG (某些实现不兼容)
                'mjpegb',        // Motion JPEG B
                'jpeg2000',      // JPEG 2000
                'vc1',           // VC-1
                'msmpeg4v3',     // MS MPEG4v3
                'msmpeg4v2',     // MS MPEG4v2
                'msmpeg4v1'      // MS MPEG4v1
            ];
            
            if (info.video && uncommonCodecs.includes(info.video.codec)) {
                logger.info(`检测到需要转码的格式: ${info.video.codec}`);
                return true;
            }
            
            // 特别检查 MOV 容器中的编解码器
            if (info.format && info.format.includes('mov')) {
                logger.info(`检测到MOV格式文件，视频编解码器: ${info.video ? info.video.codec : 'unknown'}`);
                
                // MOV 文件如果使用非 h264 编解码器，大概率需要转码
                if (info.video && info.video.codec !== 'h264' && info.video.codec !== 'h265' && info.video.codec !== 'hevc') {
                    logger.info(`MOV文件使用非标准编解码器 ${info.video.codec}，需要转码以确保兼容性`);
                    return true;
                }
            }
            
            // 检查是否缺少音频轨道（某些MPEG只有视频）
            if (info.video && !info.audio && info.video.codec.includes('mpeg')) {
                logger.info('MPEG格式且无音频轨道，建议转码以确保兼容性');
                return true;
            }
            
            // 检查是否需要特定解码器（只有在明确选择非auto时才转码）
            if (this.config.videoDecoder !== 'auto' && this.config.videoDecoder !== 'ffmpeg') {
                return true;
            }
            
            if (this.config.audioDecoder !== 'auto' && this.config.audioDecoder !== 'ffmpeg') {
                return true;
            }
            
            return false;
        } catch (err) {
            logger.error('检测视频格式失败', err);
            console.error('检测视频格式失败:', err);
            // 出错时不转码，让浏览器尝试直接播放
            return false;
        }
    }
    
    // 获取支持的硬件加速类型
    getSupportedHWAccel() {
        const platform = process.platform;
        const accelTypes = {
            'win32': ['dxva2', 'd3d11va'],
            'darwin': ['videotoolbox'],
            'linux': ['vaapi', 'vdpau']
        };
        
        return accelTypes[platform] || [];
    }
}

// 导出单例
module.exports = new VideoDecoder();

