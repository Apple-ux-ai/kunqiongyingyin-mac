// 日志记录模块
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class Logger {
    constructor() {
        this.initialized = false;
        this.logDir = null;
        this.logFile = null;
        this.pendingLogs = [];  // 存储初始化前的日志
    }
    
    // 延迟初始化
    init() {
        if (this.initialized) return;
        
        try {
            // 日志文件路径 - 保存在项目根目录的logs文件夹
            this.logDir = path.join(app.getAppPath(), 'logs');
            this.logFile = path.join(this.logDir, `player_${this.getDateString()}.log`);
            
            // 确保日志目录存在
            this.ensureLogDir();
            
            // 初始化日志
            this.writeLog('='.repeat(80));
            this.writeLog(`鲲穹AI播放器 - 日志启动时间: ${new Date().toLocaleString('zh-CN')}`);
            this.writeLog(`日志文件: ${this.logFile}`);
            this.writeLog(`系统: ${process.platform} ${process.arch}`);
            this.writeLog(`Electron版本: ${process.versions.electron}`);
            this.writeLog(`Node版本: ${process.versions.node}`);
            this.writeLog('='.repeat(80));
            this.writeLog('');
            
            // 写入之前积累的日志
            this.pendingLogs.forEach(log => {
                this.writeLog(log.message, log.level);
            });
            this.pendingLogs = [];
            
            this.initialized = true;
        } catch (err) {
            console.error('日志系统初始化失败:', err);
        }
    }
    
    // 确保日志目录存在
    ensureLogDir() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }
    
    // 获取日期字符串
    getDateString() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}${month}${day}`;
    }
    
    // 获取时间戳
    getTimestamp() {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const ms = String(now.getMilliseconds()).padStart(3, '0');
        return `${hours}:${minutes}:${seconds}.${ms}`;
    }
    
    // 写入日志
    writeLog(message, level = 'INFO') {
        // 如果还未初始化，存储到待写入队列
        if (!this.initialized) {
            this.pendingLogs.push({ message, level });
            return;
        }
        
        const timestamp = this.getTimestamp();
        const logLine = `[${timestamp}] [${level}] ${message}\n`;
        
        try {
            fs.appendFileSync(this.logFile, logLine, 'utf8');
        } catch (err) {
            console.error('写入日志文件失败:', err);
        }
    }
    
    // 各级别日志方法
    info(message) {
        if (!this.initialized) this.init();
        this.writeLog(message, 'INFO');
        console.log(`[INFO] ${message}`);
    }
    
    warn(message) {
        if (!this.initialized) this.init();
        this.writeLog(message, 'WARN');
        console.warn(`[WARN] ${message}`);
    }
    
    error(message, error = null) {
        if (!this.initialized) this.init();
        let fullMessage = message;
        if (error) {
            fullMessage += `\n错误详情: ${error.message}`;
            if (error.stack) {
                fullMessage += `\n堆栈: ${error.stack}`;
            }
        }
        this.writeLog(fullMessage, 'ERROR');
        console.error(`[ERROR] ${message}`, error);
    }
    
    debug(message) {
        if (!this.initialized) this.init();
        this.writeLog(message, 'DEBUG');
        console.log(`[DEBUG] ${message}`);
    }
    
    // 记录视频加载信息
    logVideoLoad(fileName, filePath, fileSize) {
        if (!this.initialized) this.init();
        const message = `视频加载: 文件名="${fileName}", 路径="${filePath}", 大小=${fileSize} bytes`;
        this.info(message);
    }
    
    // 记录解码器配置
    logDecoderConfig(config) {
        if (!this.initialized) this.init();
        const message = `解码器配置: ${JSON.stringify(config, null, 2)}`;
        this.info(message);
    }
    
    // 记录播放事件
    logPlaybackEvent(event, details = '') {
        if (!this.initialized) this.init();
        const message = `播放事件: ${event} ${details}`;
        this.info(message);
    }
    
    // 获取日志文件路径
    getLogFilePath() {
        return this.logFile;
    }
    
    // 读取日志内容
    readLog() {
        try {
            if (fs.existsSync(this.logFile)) {
                return fs.readFileSync(this.logFile, 'utf8');
            }
            return '日志文件不存在';
        } catch (err) {
            return `读取日志失败: ${err.message}`;
        }
    }
    
    // 清理旧日志（保留最近30天，不自动删除）
    cleanOldLogs() {
        try {
            const files = fs.readdirSync(this.logDir);
            const now = Date.now();
            const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
            
            files.forEach(file => {
                const filePath = path.join(this.logDir, file);
                const stats = fs.statSync(filePath);
                
                // 只清理30天前的日志，保留更长时间
                if (stats.mtime.getTime() < thirtyDaysAgo) {
                    fs.unlinkSync(filePath);
                    this.info(`清理旧日志: ${file}`);
                }
            });
        } catch (err) {
            this.error('清理旧日志失败', err);
        }
    }
    
    // 导出日志到指定位置
    exportLog(targetPath) {
        try {
            fs.copyFileSync(this.logFile, targetPath);
            this.info(`日志已导出到: ${targetPath}`);
            return { success: true, path: targetPath };
        } catch (err) {
            this.error('导出日志失败', err);
            return { success: false, error: err.message };
        }
    }
}

// 导出单例
module.exports = new Logger();

