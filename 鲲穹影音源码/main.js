const { app, BrowserWindow, Menu, ipcMain, screen, dialog, shell, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { exec } = require('child_process');
const decoder = require('./decoder');
const logger = require('./logger');
const authManager = require('./auth-manager');
const updateManager = require('./update-manager');

// 设置 AppUserModelID（仅 Windows；与 package.json build.appId 一致）
if (process.platform === 'win32') {
    app.setAppUserModelId('com.kq.player.v113.ultimate');
}

/**
 * 功能：主进程核心逻辑，负责窗口管理、系统级交互及注册表检测
 * 作者：FullStack-Guardian
 * 更新时间：2026-02-09
 */

// 登录相关密钥 (从接入文档获取)
const SECRET_KEY = "7530bfb1ad6c41627b0f0620078fa5ed";

let mainWindow;
let lightsOffWindow = null;
let filePathToOpen = null; // 存储待播放的文件路径

const VIDEO_OPEN_EXTS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.flv', '.wmv', '.rmvb', '.webm', '.ts', '.3gp']);

function isOpenableVideoPath(p) {
    return p && VIDEO_OPEN_EXTS.has(path.extname(p).toLowerCase());
}

/** macOS open-file 与 Windows 第二实例共用：窗口未就绪时写入 filePathToOpen */
function queueOrSendOpenFile(filePath) {
    if (!isOpenableVideoPath(filePath)) {
        return;
    }
    const resolved = path.resolve(filePath);
    if (mainWindow && !mainWindow.isDestroyed()) {
        logger.info(`向渲染进程发送待播放文件: ${resolved}`);
        mainWindow.webContents.send('open-file', resolved);
    } else {
        filePathToOpen = resolved;
        logger.info(`排队待播放文件: ${resolved}`);
    }
}

// macOS：通过「打开方式」或关联扩展名启动时由系统触发（须在 ready 之前注册）
if (process.platform === 'darwin') {
    app.on('open-file', (event, filePath) => {
        event.preventDefault();
        logger.info(`open-file 事件: ${filePath}`);
        queueOrSendOpenFile(filePath);
    });
}

// 解析命令行参数获取文件路径
function getFilePathFromArgs(args) {
    logger.info(`解析命令行参数: ${JSON.stringify(args)}`);
    // 在 Windows 上，关联文件通常作为最后一个或倒数第二个参数传递
    // 过滤掉 electron 启动参数和可执行文件路径
    const pathArg = args.find(arg => {
        if (arg.startsWith('--') || arg === '.') return false;
        // 简单的视频后缀判断
        return isOpenableVideoPath(arg);
    });
    return pathArg ? path.resolve(pathArg) : null;
}

// 如果是生产环境，首个参数可能是 exe 路径，第二个可能是文件路径
const initialFile = process.defaultApp ? process.argv[2] : process.argv[1];
if (initialFile && !initialFile.startsWith('--') && isOpenableVideoPath(initialFile)) {
    filePathToOpen = path.resolve(initialFile);
    logger.info(`启动时发现待播放文件: ${filePathToOpen}`);
}

function createWindow() {
    logger.info('创建主窗口...');
    
    const appIconPath = path.join(__dirname, process.platform === 'win32' ? 'kq-ai-v113-final.ico' : 'kq-ai-v113-final.png');
    const appDisplayName = '鲲穹影音';

    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        title: appDisplayName,
        backgroundColor: '#000000',
        frame: false,
        icon: appIconPath,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true,
            allowRunningInsecureContent: false,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    // Windows：设置任务栏/右键菜单中显示的应用名称与图标，避免显示为 "Electron"
    if (process.platform === 'win32' && mainWindow.setAppDetails) {
        try {
            mainWindow.setAppDetails({
                appId: 'com.kq.player.v113.ultimate',
                appIconPath: path.join(__dirname, 'kq-ai-v113-final.ico'),
                relaunchDisplayName: appDisplayName
            });
        } catch (e) {
            logger.warn('setAppDetails 失败:', e);
        }
    }

    // 加载主页面
    mainWindow.loadFile('index.html');
    
    // 拦截所有新窗口创建请求，强制在外部浏览器打开
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        logger.info(`拦截到窗口打开请求: ${url}，正在尝试外部浏览器打开...`);
        shell.openExternal(url);
        return { action: 'deny' }; // 拒绝在应用内创建新窗口
    });
    
    logger.info(`主窗口创建成功，尺寸: 1280x800`);
    
    // 页面加载完成后，发送初始窗口状态
    mainWindow.webContents.once('did-finish-load', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('window-maximize-changed', mainWindow.isMaximized());
            
            // 如果启动时有待播放文件，发送给渲染进程
            if (filePathToOpen) {
                logger.info(`页面加载完成，发送待播放文件: ${filePathToOpen}`);
                mainWindow.webContents.send('open-file', filePathToOpen);
                filePathToOpen = null; // 发送后清除
            }
        }
    });

    // 开发模式下打开开发者工具
    // mainWindow.webContents.openDevTools();

    // 窗口关闭事件
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
    
    // 窗口最小化时也关闭关灯遮罩
    mainWindow.on('minimize', () => {
        if (lightsOffWindow && !lightsOffWindow.isDestroyed()) {
            try {
                lightsOffWindow.hide();
            } catch (e) {}
        }
    });
    
    // 窗口恢复时重新显示关灯遮罩
    mainWindow.on('restore', () => {
        if (lightsOffWindow && !lightsOffWindow.isDestroyed()) {
            try {
                lightsOffWindow.show();
                mainWindow.setAlwaysOnTop(true);
                mainWindow.focus();
            } catch (e) {}
        }
        // 通知渲染进程窗口状态变化
        mainWindow.webContents.send('window-maximize-changed', false);
    });
    
    // 窗口最大化时通知渲染进程
    mainWindow.on('maximize', () => {
        mainWindow.webContents.send('window-maximize-changed', true);
    });
    
    // 窗口取消最大化时通知渲染进程
    mainWindow.on('unmaximize', () => {
        mainWindow.webContents.send('window-maximize-changed', false);
    });

    // 应用菜单：保留「帮助」以便打开开发者工具（解决无法按 F12 的问题）
    const template = [
        {
            label: '帮助',
            submenu: [
                {
                    label: '打开开发者工具 (F12)',
                    accelerator: 'F12',
                    click: () => {
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.webContents.toggleDevTools();
                        }
                    }
                },
                ...(process.platform === 'darwin'
                    ? [
                          {
                              label: '打开开发者工具 (Cmd+Alt+I)',
                              accelerator: 'Alt+Command+I',
                              click: () => {
                                  if (mainWindow && !mainWindow.isDestroyed()) {
                                      mainWindow.webContents.toggleDevTools();
                                  }
                              }
                          }
                      ]
                    : []),
                {
                    label: '重新加载',
                    accelerator: 'CmdOrCtrl+R',
                    click: () => {
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.webContents.reload();
                        }
                    }
                }
            ]
        }
    ];
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

// Electron 准备完成
app.whenReady().then(() => {
    createWindow();
    // 注册 F12 打开/关闭开发者工具（无边框窗口时菜单可能不可见）
    globalShortcut.register('F12', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.toggleDevTools();
        }
    });
    authManager.initIpc(mainWindow);
    updateManager.init(mainWindow);

    // ========== 默认播放器设置相关 IPC ==========
    
    // 检查是否为默认播放器
    ipcMain.handle('check-default-status', async () => {
        return new Promise((resolve) => {
            if (process.platform !== 'win32') {
                resolve(false);
                return;
            }

            // 与 installer.nsh 中注册的 ProgId 一致；同时兼容 package.json 的 appId
            const ourProgIds = ['com.kunqiong.aiplayer', 'com.kq.player.v113.ultimate', 'kunqiong-ai-player'];
            const extToCheck = ['.mp4', '.mkv', '.avi'];
            const regRoot = 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts';

            const checkOne = (ext, cb) => {
                const regPath = `${regRoot}\\${ext}\\UserChoice`;
                exec(`reg query "${regPath}" /v ProgId`, (error, stdout) => {
                    if (error) {
                        cb(false, null);
                        return;
                    }
                    const isOurs = ourProgIds.some(id => stdout.includes(id));
                    cb(isOurs, stdout);
                });
            };

            let checked = 0;
            let found = false;
            extToCheck.forEach(ext => {
                checkOne(ext, (isOurs, stdout) => {
                    if (isOurs) found = true;
                    if (stdout) logger.info(`默认播放器检查 ${ext} UserChoice: ${(stdout || '').trim().replace(/\s+/g, ' ')}`);
                    checked++;
                    if (checked === extToCheck.length) {
                        logger.info(`默认播放器状态检查: ${found ? '已是默认' : '非默认'}`);
                        resolve(found);
                    }
                });
            });
        });
    });

    // 唤起系统设置页面
    ipcMain.on('set-as-default', () => {
        logger.info('引导用户设置默认应用');
        if (process.platform === 'win32') {
            shell.openExternal('ms-settings:defaultapps');
        } else if (process.platform === 'darwin') {
            shell.openExternal('x-apple.systempreferences:com.apple.Apps-Settings.extension');
        }
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// 所有窗口关闭时退出应用
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('will-quit', () => {
    if (app.isReady()) {
        globalShortcut.unregisterAll();
    }
});

// 防止多实例运行
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
            
            // 处理第二实例传递的文件路径
            const fileToOpen = getFilePathFromArgs(commandLine);
            if (fileToOpen) {
                logger.info(`第二实例触发播放: ${fileToOpen}`);
                queueOrSendOpenFile(fileToOpen);
            }
        }
    });
}

// ========== 关灯模式功能 ==========
// 创建关灯遮罩窗口
function createLightsOffWindow() {
    if (lightsOffWindow) return;
    
    // 获取所有显示器信息
    const displays = screen.getAllDisplays();
    const primaryDisplay = screen.getPrimaryDisplay();
    const { x, y, width, height } = primaryDisplay.bounds;
    
    lightsOffWindow = new BrowserWindow({
        x: x,
        y: y,
        width: width,
        height: height,
        frame: false,
        transparent: true,
        alwaysOnTop: false,  // 改为false，让主窗口可以在上层
        skipTaskbar: true,
        hasShadow: false,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        closable: false,
        focusable: false,
        show: false,  // 初始不显示
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });
    
    // 设置窗口忽略鼠标事件，让点击穿透到下层
    lightsOffWindow.setIgnoreMouseEvents(true);
    
    // 设置窗口层级：在桌面之上，但在普通窗口之下
    lightsOffWindow.setAlwaysOnTop(true, 'screen-saver');
    
    // 加载遮罩HTML内容 - 纯黑背景模拟影院环境
    lightsOffWindow.loadURL(`data:text/html;charset=utf-8,
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                * { margin: 0; padding: 0; }
                body {
                    width: 100vw;
                    height: 100vh;
                    background: #000000;
                    overflow: hidden;
                    -webkit-app-region: no-drag;
                }
            </style>
        </head>
        <body></body>
        </html>
    `);
    
    // 窗口加载完成后显示并确保主窗口在最上层
    lightsOffWindow.once('ready-to-show', () => {
        lightsOffWindow.show();
        if (mainWindow) {
            // 确保主窗口在遮罩窗口之上
            mainWindow.setAlwaysOnTop(true);
            mainWindow.focus();
        }
    });
}

// 关闭关灯遮罩窗口
function closeLightsOffWindow() {
    if (lightsOffWindow && !lightsOffWindow.isDestroyed()) {
        try {
            lightsOffWindow.close();
        } catch (e) {
            console.log('关灯窗口已关闭');
        }
        lightsOffWindow = null;
    }
    // 恢复主窗口的正常层级
    if (mainWindow && !mainWindow.isDestroyed()) {
        try {
            mainWindow.setAlwaysOnTop(false);
        } catch (e) {
            console.log('主窗口已关闭');
        }
    }
}

// 监听来自渲染进程的关灯模式切换请求
ipcMain.on('toggle-lights-off', (event, isOn) => {
    if (isOn) {
        createLightsOffWindow();
    } else {
        closeLightsOffWindow();
    }
});

// ========== 系统路径（渲染进程截图默认目录等）==========
ipcMain.handle('get-path', async (event, name) => {
    const allowed = new Set(['home', 'appData', 'userData', 'temp', 'desktop', 'documents', 'downloads', 'music', 'pictures', 'videos', 'logs']);
    if (!allowed.has(name)) {
        throw new Error('不允许的路径名称');
    }
    return app.getPath(name);
});

// ========== 文件选择对话框 ==========
// 处理选择文件请求
ipcMain.handle('select-files', async (event, options) => {
    try {
        const result = await dialog.showOpenDialog(mainWindow, {
            title: options?.title || '选择文件',
            properties: options?.properties || ['openFile', 'multiSelections'],
            filters: [
                { name: '视频文件', extensions: ['mp4', 'webm', 'ogg', 'mkv', 'avi', 'mov', 'flv', 'wmv', 'ts', 'm2ts', 'mts', 'm2t', '3gp', 'gif', 'rm', 'rmvb', 'mpe', 'm2p', 'mpg', 'm4v', 'vob', 'm2v', 'asx', 'f4v'] },
                { name: '所有文件', extensions: ['*'] }
            ]
        });
        
        return result;
    } catch (error) {
        console.error('打开文件选择对话框失败:', error);
        return { canceled: true, filePaths: [] };
    }
});

// 获取文件大小
ipcMain.handle('get-file-size', async (event, filePath) => {
    try {
        const fs = require('fs');
        const stats = fs.statSync(filePath);
        return stats.size;
    } catch (error) {
        logger.error(`获取文件大小失败: ${filePath}`, error);
        return 0;
    }
});

// 处理选择目录请求
ipcMain.handle('select-directory', async (event, options) => {
    try {
        const result = await dialog.showOpenDialog(mainWindow, {
            title: options?.title || '选择文件夹',
            properties: ['openDirectory'],
            defaultPath: options?.defaultPath || app.getPath('pictures')
        });
        
        return result;
    } catch (error) {
        console.error('打开文件选择对话框失败:', error);
        return { canceled: true, filePaths: [] };
    }
});

// 处理保存文件对话框请求
ipcMain.handle('show-save-dialog', async (event, options) => {
    try {
        const result = await dialog.showSaveDialog(mainWindow, {
            title: options?.title || '保存文件',
            defaultPath: options?.defaultPath || '',
            filters: options?.filters || []
        });
        
        return result;
    } catch (error) {
        console.error('打开保存对话框失败:', error);
        return { canceled: true, filePath: null };
    }
});

// 主窗口关闭时也关闭遮罩窗口
app.on('before-quit', () => {
    closeLightsOffWindow();
    // 清理临时文件
    decoder.cleanupTempFiles();
});

// ========== 窗口控制功能 ==========
// 处理窗口最小化请求
ipcMain.on('window-minimize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.minimize();
    }
});

// 处理窗口最大化/还原请求
ipcMain.on('window-toggle-maximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
    }
});

// 处理窗口关闭请求
ipcMain.on('window-close', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.close();
    }
});

// ========== 视频解码器功能 ==========

// ========== 日志功能 ==========

// 记录日志
ipcMain.handle('log-message', async (event, level, message, error) => {
    try {
        switch(level) {
            case 'info':
                logger.info(message);
                break;
            case 'warn':
                logger.warn(message);
                break;
            case 'error':
                logger.error(message, error);
                break;
            case 'debug':
                logger.debug(message);
                break;
            default:
                logger.info(message);
        }
        return { success: true };
    } catch (err) {
        console.error('记录日志失败:', err);
        return { success: false, error: err.message };
    }
});

// 获取日志文件路径
ipcMain.handle('get-log-path', async () => {
    try {
        const logPath = logger.getLogFilePath();
        logger.info(`日志路径被请求: ${logPath}`);
        return { success: true, path: logPath };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// 读取日志内容
ipcMain.handle('read-log', async () => {
    try {
        const content = logger.readLog();
        return { success: true, content };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// 导出日志
ipcMain.handle('export-log', async (event, targetPath) => {
    try {
        const result = logger.exportLog(targetPath);
        return result;
    } catch (error) {
        logger.error('导出日志失败', error);
        return { success: false, error: error.message };
    }
});

// ========== 登录相关 IPC 处理器 ==========

// 生成带签名的 Nonce
ipcMain.handle('generate-signed-nonce', async () => {
    const nonce = crypto.randomBytes(16).toString('hex');
    const timestamp = Math.floor(Date.now() / 1000);
    const message = `${nonce}|${timestamp}`;
    
    const signature = crypto
        .createHmac('sha256', SECRET_KEY)
        .update(message)
        .digest('base64');
        
    return { nonce, timestamp, signature };
});

// 打开外部 URL（仅允许 http/https，防止 javascript:、file: 等协议滥用）
ipcMain.on('open-external', (event, url) => {
    if (typeof url !== 'string' || !url.trim()) return;
    const trimmed = url.trim().toLowerCase();
    if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
        shell.openExternal(url.trim());
    } else {
        logger.warn(`拒绝打开非安全链接: ${url.substring(0, 80)}${url.length > 80 ? '...' : ''}`);
    }
});

// 更新解码器配置
ipcMain.handle('update-decoder-config', async (event, config) => {
    try {
        logger.logDecoderConfig(config);
        decoder.updateConfig(config);
        return { success: true };
    } catch (error) {
        logger.error('更新解码器配置失败', error);
        console.error('更新解码器配置失败:', error);
        return { success: false, error: error.message };
    }
});

// 获取视频信息
ipcMain.handle('get-video-info', async (event, filePath) => {
    try {
        logger.info(`获取视频信息: ${filePath}`);
        const info = await decoder.getVideoInfo(filePath);
        logger.info(`视频信息获取成功: ${JSON.stringify(info)}`);
        return { success: true, info };
    } catch (error) {
        logger.error(`获取视频信息失败: ${filePath}`, error);
        console.error('获取视频信息失败:', error);
        return { success: false, error: error.message };
    }
});

// 检测是否需要转码
ipcMain.handle('check-needs-transcode', async (event, filePath) => {
    try {
        logger.info(`检查文件是否需要转码: ${filePath}`);
        const needs = await decoder.needsTranscode(filePath);
        logger.info(`转码检测结果: ${needs ? '需要转码' : '无需转码'}`);
        return { success: true, needsTranscode: needs };
    } catch (error) {
        logger.error('检测视频格式失败', error);
        console.error('检测视频格式失败:', error);
        return { success: false, error: error.message };
    }
});

// 查询是否有该文件的解码缓存（用于再次点击时直接使用缓存，无需等待解码）
ipcMain.handle('get-transcode-cache', async (event, filePath) => {
    try {
        const outputPath = decoder.getCachedOutputPath(filePath);
        return { cached: !!outputPath, outputPath: outputPath || null };
    } catch (error) {
        logger.error('查询解码缓存失败', error);
        return { cached: false, outputPath: null };
    }
});

// 转码视频（同一文件再次播放会返回缓存路径，fromCache: true）
ipcMain.handle('transcode-video', async (event, inputPath, options) => {
    try {
        logger.info(`开始转码视频: ${inputPath}`);
        const result = await decoder.transcodeVideo(inputPath, options);
        const { outputPath, fromCache } = result;
        logger.info(`视频转码成功: ${outputPath}, 来自缓存: ${!!fromCache}`);
        return { success: true, outputPath, fromCache: !!fromCache };
    } catch (error) {
        logger.error(`视频转码失败: ${inputPath}`, error);
        console.error('视频转码失败:', error);
        return { success: false, error: error.message };
    }
});

// 提取视频流
ipcMain.handle('extract-video-stream', async (event, inputPath) => {
    try {
        const outputPath = await decoder.extractVideoStream(inputPath);
        return { success: true, outputPath };
    } catch (error) {
        console.error('提取视频流失败:', error);
        return { success: false, error: error.message };
    }
});

// 提取音频流
ipcMain.handle('extract-audio-stream', async (event, inputPath) => {
    try {
        const outputPath = await decoder.extractAudioStream(inputPath);
        return { success: true, outputPath };
    } catch (error) {
        console.error('提取音频流失败:', error);
        return { success: false, error: error.message };
    }
});

// 获取支持的硬件加速类型
ipcMain.handle('get-supported-hwaccel', async () => {
    try {
        const types = decoder.getSupportedHWAccel();
        return { success: true, types };
    } catch (error) {
        console.error('获取硬件加速类型失败:', error);
        return { success: false, error: error.message };
    }
});

// 清理临时文件
ipcMain.handle('cleanup-temp-files', async () => {
    try {
        decoder.cleanupTempFiles();
        return { success: true };
    } catch (error) {
        console.error('清理临时文件失败:', error);
        return { success: false, error: error.message };
    }
});
