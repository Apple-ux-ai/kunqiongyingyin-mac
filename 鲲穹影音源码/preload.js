const { contextBridge, ipcRenderer, shell } = require('electron');

/**
 * 功能：预加载脚本，暴露安全的 API 给渲染进程
 * 作者：FullStack-Guardian
 * 更新时间：2026-02-02
 */

// 暴露安全的API给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
    // 关灯模式切换
    toggleLightsOff: (isOn) => {
        ipcRenderer.send('toggle-lights-off', isOn);
    },
    
    // 默认播放器设置
    checkDefaultStatus: () => ipcRenderer.invoke('check-default-status'),
    setAsDefault: () => ipcRenderer.send('set-as-default'),
    
    // 系统路径（如 pictures、documents），仅允许白名单内的名称
    getPath: (name) => ipcRenderer.invoke('get-path', name),

    // 选择目录
    selectDirectory: (options) => ipcRenderer.invoke('select-directory', options),
    
    // 选择文件
    selectFiles: (options) => ipcRenderer.invoke('select-files', options),

    // 获取文件大小
    getFileSize: (filePath) => ipcRenderer.invoke('get-file-size', filePath),
    
    // 显示保存对话框
    showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
    
    // 在资源管理器中显示文件
    showItemInFolder: (filePath) => shell.showItemInFolder(filePath),
    
    // ========== 窗口控制API ==========
    
    // 最小化窗口
    minimizeWindow: () => ipcRenderer.send('window-minimize'),
    
    // 最大化/还原窗口
    toggleMaximizeWindow: () => ipcRenderer.send('window-toggle-maximize'),
    
    // 监听窗口状态变化
    onWindowMaximize: (callback) => ipcRenderer.on('window-maximize-changed', (event, isMaximized) => callback(isMaximized)),
    
    // 监听文件打开请求
    onOpenFile: (callback) => {
        ipcRenderer.on('open-file', (event, filePath) => callback(filePath));
    },
    
    // 关闭窗口
    closeWindow: () => ipcRenderer.send('window-close'),
    
    // ========== 视频解码器API ==========
    
    // 更新解码器配置
    updateDecoderConfig: (config) => ipcRenderer.invoke('update-decoder-config', config),
    
    // 获取视频信息
    getVideoInfo: (filePath) => ipcRenderer.invoke('get-video-info', filePath),
    
    // 检测是否需要转码
    checkNeedsTranscode: (filePath) => ipcRenderer.invoke('check-needs-transcode', filePath),

    // 查询是否有该文件的解码缓存（再次点击同一视频时可直接用缓存播放）
    getTranscodeCache: (filePath) => ipcRenderer.invoke('get-transcode-cache', filePath),

    // 转码视频
    transcodeVideo: (inputPath, options) => ipcRenderer.invoke('transcode-video', inputPath, options),
    
    // 提取视频流
    extractVideoStream: (inputPath) => ipcRenderer.invoke('extract-video-stream', inputPath),
    
    // 提取音频流
    extractAudioStream: (inputPath) => ipcRenderer.invoke('extract-audio-stream', inputPath),
    
    // 获取支持的硬件加速类型
    getSupportedHWAccel: () => ipcRenderer.invoke('get-supported-hwaccel'),
    
    // 清理临时文件
    cleanupTempFiles: () => ipcRenderer.invoke('cleanup-temp-files'),
    
    // ========== 日志API ==========
    
    // 记录日志
    logMessage: (level, message, error) => ipcRenderer.invoke('log-message', level, message, error),
    
    // 获取日志文件路径
    getLogPath: () => ipcRenderer.invoke('get-log-path'),
    
    // 读取日志内容
    readLog: () => ipcRenderer.invoke('read-log'),
    
    // 导出日志
    exportLog: (targetPath) => ipcRenderer.invoke('export-log', targetPath),

    // ========== 登录 API ==========
    
    // 生成带签名的 Nonce
    generateSignedNonce: () => ipcRenderer.invoke('generate-signed-nonce'),
    
    // 打开外部 URL
    openExternal: (url) => ipcRenderer.send('open-external', url),

    // 反馈问题
    openFeedback: () => ipcRenderer.send('auth:open-feedback'),

    // ========== 授权码 API ==========
    auth: {
        getMachineCode: () => ipcRenderer.invoke('auth:get-machine-code'),
        checkNeedAuth: () => ipcRenderer.invoke('auth:check-need-auth'),
        verifyCode: (code) => ipcRenderer.invoke('auth:verify-code', code),
        openUrl: (url) => ipcRenderer.send('auth:open-url', url)
    },

    // ========== 更新 API ==========
    checkUpdate: () => ipcRenderer.invoke('update:check'),
    downloadUpdate: () => ipcRenderer.invoke('update:download'),
    installUpdate: () => ipcRenderer.invoke('update:install'),
    onUpdateStatus: (callback) => ipcRenderer.on('update-status', (event, data) => callback(data)),
    onUpdateProgress: (callback) => ipcRenderer.on('update-progress', (event, data) => callback(data)),
    onUpdateResult: (callback) => ipcRenderer.on('update:result', (event, data) => callback(data))
});

// 暴露ipcRenderer用于调用
contextBridge.exposeInMainWorld('ipcRenderer', {
    invoke: (channel, data) => {
        const validChannels = ['select-directory', 'show-save-dialog', 'log-message', 'get-log-path', 'read-log', 'export-log'];
        if (validChannels.includes(channel)) {
            return ipcRenderer.invoke(channel, data);
        }
    }
});
