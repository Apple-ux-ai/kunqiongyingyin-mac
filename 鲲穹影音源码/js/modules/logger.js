/**
 * 鲲穹AI播放器 - 日志模块
 */
export const Logger = {
    info: (msg) => {
        console.log('[INFO]', msg);
        if (window.electronAPI && window.electronAPI.logMessage) {
            window.electronAPI.logMessage('info', msg);
        }
    },
    warn: (msg) => {
        console.warn('[WARN]', msg);
        if (window.electronAPI && window.electronAPI.logMessage) {
            window.electronAPI.logMessage('warn', msg);
        }
    },
    error: (msg, err) => {
        console.error('[ERROR]', msg, err);
        if (window.electronAPI && window.electronAPI.logMessage) {
            window.electronAPI.logMessage('error', msg, err);
        }
    },
    debug: (msg) => {
        console.log('[DEBUG]', msg);
        if (window.electronAPI && window.electronAPI.logMessage) {
            window.electronAPI.logMessage('debug', msg);
        }
    }
};
