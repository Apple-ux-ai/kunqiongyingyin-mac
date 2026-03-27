const { ipcMain, app, dialog, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const logger = require('./logger');

class UpdateManager {
    constructor() {
        this.mainWindow = null;
        this.updateUrl = 'http://software.kunqiongai.com:8000/api/v1/updates/check/';
        this.softwareId = '10007'; // 对应平台上的软件 ID
    }

    init(mainWindow) {
        this.mainWindow = mainWindow;
        this.setupIpc();
        
        // 启动 5 秒后自动检查更新
        setTimeout(() => {
            this.checkForUpdates(false);
        }, 5000);
    }

    async checkForUpdates(manual = false) {
        try {
            const currentVersion = app.getVersion();
            const url = `${this.updateUrl}?software=${this.softwareId}&version=${currentVersion}`;
            
            logger.info(`正在检查更新: ${url}`);
            
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            logger.info('收到更新响应:', data);

            if (data.has_update) {
                this.handleUpdateAvailable(data);
            } else if (manual) {
                // 手动检查且已是最新版本：仅发送语义化结果，由渲染进程根据当前语言组装文案
                this.sendToRenderer('update:result', {
                    type: 'info',
                    code: 'no_update',
                    currentVersion
                });
            }
        } catch (error) {
            logger.error('检查更新失败:', error);
            if (manual) {
                this.sendToRenderer('update:result', {
                    type: 'error',
                    code: 'check_failed',
                    errorMessage: error.message
                });
            }
        }
    }

    handleUpdateAvailable(updateInfo) {
        const { version, update_log, download_url, package_hash } = updateInfo;
        
        // 强制更新：只保留“立即更新”按钮
        dialog.showMessageBox(this.mainWindow, {
            type: 'info',
            title: '发现新版本',
            message: `发现新版本 ${version}，是否立即更新？`,
            detail: `更新日志：\n${update_log || '无'}`,
            buttons: ['立即更新'],
            defaultId: 0,
            cancelId: -1, // 禁止 ESC 取消（实际上 ESC 会返回 cancelId，我们在回调中处理退出）
            noLink: true
        }).then(({ response }) => {
            if (response === 0) {
                // 点击“立即更新”
                this.startUpdate(download_url, package_hash);
            } else {
                // 点击关闭按钮 (X) 或按 ESC，强制退出应用
                app.quit();
            }
        });
    }

    startUpdate(url, hash) {
        if (process.platform === 'darwin') {
            this.startUpdateDarwin(url, hash);
            return;
        }

        if (process.platform !== 'win32') {
            logger.warn(`当前平台 ${process.platform} 不支持内置更新程序`);
            dialog.showErrorBox('更新', '当前平台暂不支持自动更新，请到官网下载安装包。');
            return;
        }

        try {
            let updaterPath;
            if (app.isPackaged) {
                updaterPath = path.join(process.resourcesPath, 'updater.exe');
            } else {
                updaterPath = path.join(app.getAppPath(), 'bin', 'updater.exe');
            }

            const appDir = path.dirname(process.execPath);
            const exeName = path.basename(process.execPath);

            logger.info(`启动更新程序: ${updaterPath}`);
            logger.info(`参数: url=${url}, hash=${hash}, dir=${appDir}, exe=${exeName}, pid=${process.pid}`);

            const args = [
                '--url', url,
                '--hash', hash,
                '--dir', appDir,
                '--exe', exeName,
                '--pid', process.pid.toString()
            ];

            const subprocess = spawn(updaterPath, args, {
                detached: true,
                stdio: 'ignore',
                windowsHide: false
            });

            subprocess.unref();

            app.quit();
        } catch (error) {
            logger.error('启动更新程序失败:', error);
            dialog.showErrorBox('更新失败', `无法启动更新程序: ${error.message}`);
        }
    }

    startUpdateDarwin(url, hash) {
        logger.info(`macOS 更新: 打开下载链接 url=${url}, hash=${hash || '(无)'}`);
        try {
            if (url) {
                shell.openExternal(url);
            }
            dialog
                .showMessageBox(this.mainWindow, {
                    type: 'info',
                    title: '下载更新',
                    message: '已在浏览器中打开下载页面。',
                    detail:
                        '请下载并安装新版本后重新打开应用。若为 DMG，请将应用拖入「应用程序」文件夹覆盖旧版本。',
                    buttons: ['好的']
                })
                .then(() => app.quit());
        } catch (error) {
            logger.error('macOS 更新引导失败:', error);
            dialog.showErrorBox('更新失败', error.message || String(error));
        }
    }

    setupIpc() {
        // 手动触发检查更新
        ipcMain.handle('update:check', async () => {
            await this.checkForUpdates(true);
            return { success: true };
        });
    }

    sendToRenderer(channel, data) {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send(channel, data);
        }
    }
}

module.exports = new UpdateManager();
