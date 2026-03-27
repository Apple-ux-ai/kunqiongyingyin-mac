const { ipcMain, shell, net } = require('electron');
const os = require('os');
const crypto = require('crypto');
const logger = require('./logger');

class AuthManager {
    constructor() {
        this.ENABLE_AUTH = true; // 授权功能总开关：true 开启，false 关闭
        this.API_BASE_URL = 'https://api-web.kunqiongai.com';
        this.SOFT_NUMBER = '10019'; // 对应 demo.py 中的软件编号
        this.machineCode = this.getMachineCode();
    }

    /**
     * 发起请求逻辑（兼容无参数 POST）
     */
    async postRequest(url, data = null) {
        return new Promise((resolve, reject) => {
            const request = net.request({
                method: 'POST',
                url: url
            });

            if (data && Object.keys(data).length > 0) {
                request.setHeader('Content-Type', 'application/x-www-form-urlencoded');
                request.write(new URLSearchParams(data).toString());
            } else {
                // 如果没有数据，根据文档要求不设置 Content-Type (none)
                logger.info(`发起无参数 POST 请求: ${url}`);
            }

            request.on('response', (response) => {
                let body = '';
                response.on('data', (chunk) => {
                    body += chunk.toString();
                });
                response.on('end', () => {
                    try {
                        const json = JSON.parse(body);
                        resolve(json);
                    } catch (e) {
                        logger.error(`解析响应失败: ${body}`);
                        reject(new Error('解析响应失败'));
                    }
                });
            });

            request.on('error', (error) => {
                reject(error);
            });

            request.end();
        });
    }

    /**
     * 获取机器码（组合 CPU + MAC + 主板信息）
     * 对应 demo.py 的逻辑
     */
    getMachineCode() {
        try {
            const platform = os.platform();
            let hardwareInfos = [];

            // 1. 获取基础硬件信息
            hardwareInfos.push(os.hostname());
            hardwareInfos.push(os.arch());
            hardwareInfos.push(platform);

            // 2. 获取网卡 MAC 地址
            const networkInterfaces = os.networkInterfaces();
            for (const name of Object.keys(networkInterfaces)) {
                for (const netInterface of networkInterfaces[name]) {
                    if (netInterface.mac && netInterface.mac !== '00:00:00:00:00:00') {
                        hardwareInfos.push(netInterface.mac);
                        break;
                    }
                }
            }

            // 组合并生成 SHA256 哈希
            const combined = hardwareInfos.join('|');
            return crypto.createHash('sha256').update(combined).digest('hex');
        } catch (error) {
            logger.error('生成机器码失败:', error);
            return 'UNKNOWN_DEVICE_' + Date.now();
        }
    }

    /**
     * 初始化 IPC 监听
     */
    initIpc(mainWindow) {
        // 获取机器码
        ipcMain.handle('auth:get-machine-code', () => this.machineCode);

        // 检查是否需要授权码
        ipcMain.handle('auth:check-need-auth', async () => {
            // 如果开关关闭，直接返回不需要验证
            if (!this.ENABLE_AUTH) {
                return {
                    success: true,
                    isNeedAuth: false
                };
            }

            // 检查本地 24 小时缓存
            if (this.lastAuthSuccessTime && (Date.now() - this.lastAuthSuccessTime < 24 * 60 * 60 * 1000)) {
                return {
                    success: true,
                    isNeedAuth: false
                };
            }

            try {
                const result = await this.postRequest(`${this.API_BASE_URL}/soft_desktop/check_get_auth_code`, {
                    device_id: this.machineCode,
                    soft_number: this.SOFT_NUMBER
                });

                if (result.code === 1) {
                    const isNeedAuth = result.data.is_need_auth_code === 1;
                    if (!isNeedAuth) {
                        this.lastAuthSuccessTime = Date.now(); // 如果服务端说不需要，记录当前时间
                    }
                    return {
                        success: true,
                        isNeedAuth: isNeedAuth,
                        authCodeUrl: result.data.auth_code_url
                    };
                } else {
                    return { success: false, msg: result.msg };
                }
            } catch (error) {
                logger.error('检查授权需求失败:', error);
                return { success: false, msg: '网络请求失败' };
            }
        });

        // 验证授权码
        ipcMain.handle('auth:verify-code', async (event, authCode) => {
            try {
                const result = await this.postRequest(`${this.API_BASE_URL}/soft_desktop/check_auth_code_valid`, {
                    device_id: this.machineCode,
                    soft_number: this.SOFT_NUMBER,
                    auth_code: authCode
                });

                if (result.code === 1) {
                    const isValid = result.data.auth_code_status === 1;
                    if (isValid) {
                        this.lastAuthSuccessTime = Date.now(); // 验证成功，记录时间
                    }
                    return {
                        success: true,
                        isValid: isValid
                    };
                } else {
                    return { success: false, msg: result.msg };
                }
            } catch (error) {
                logger.error('验证授权码失败:', error);
                return { success: false, msg: '网络请求失败' };
            }
        });

        // 打开获取授权码页面
        ipcMain.on('auth:open-url', (event, url) => {
            const fullUrl = `${url}?device_id=${this.machineCode}&software_code=${this.SOFT_NUMBER}`;
            shell.openExternal(fullUrl);
        });

        // 反馈问题
        ipcMain.on('auth:open-feedback', async () => {
            logger.info('收到 auth:open-feedback IPC 消息');
            
            // 严格按照文档：data.url 示例为 "https://www.kunqiongai.com/feedback?soft_number="
            // 直接拼接软件编号 10019
            const feedbackUrl = `https://www.kunqiongai.com/feedback?soft_number=${this.SOFT_NUMBER}`;
            
            logger.info(`在默认浏览器中打开反馈页面: ${feedbackUrl}`);
            try {
                // 使用 shell.openExternal 确保在用户默认浏览器中打开，而非应用内窗口
                await shell.openExternal(feedbackUrl);
            } catch (error) {
                logger.error('执行 shell.openExternal 失败:', error);
            }
        });
    }
}

module.exports = new AuthManager();
