/**
 * LoginManager - 鲲穹AI播放器登录逻辑控制器
 * 负责与后端 API 交互、Token 管理及登录流程控制
 */
class LoginManager {
    constructor() {
        this.API_BASE_URL = 'https://api-web.kunqiongai.com';
        this.token = localStorage.getItem('login_token') || null;
        this.userInfo = null;
        this.pollInterval = null;
        this.isPolling = false;
        this.loginTimeoutId = null;
    }

    /**
     * 初始化：检查本地 Token 是否有效
     */
    async init() {
        if (this.token) {
            const isValid = await this.checkLogin();
            if (isValid) {
                await this.fetchUserInfo();
            } else {
                this.logout();
            }
        }
        return this.isLoggedIn();
    }

    isLoggedIn() {
        return !!this.token && !!this.userInfo;
    }

    /**
     * 检查登录状态
     */
    async checkLogin() {
        if (!this.token) return false;
        try {
            const response = await fetch(`${this.API_BASE_URL}/user/check_login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `token=${this.token}`
            });
            const result = await response.json();
            return result.code === 1;
        } catch (error) {
            console.error('检查登录失败:', error);
            return false;
        }
    }

    /**
     * 获取用户信息
     */
    async fetchUserInfo() {
        if (!this.token) return null;
        try {
            const response = await fetch(`${this.API_BASE_URL}/soft_desktop/get_user_info`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'token': this.token
                }
            });
            const result = await response.json();
            if (result.code === 1) {
                this.userInfo = result.data.user_info;
                return this.userInfo;
            }
        } catch (error) {
            console.error('获取用户信息失败:', error);
        }
        return null;
    }

    /**
     * 开始登录流程
     */
    async startLoginFlow() {
        try {
            // 记录登录流程状态
            sessionStorage.setItem('login_in_progress', 'true');
            sessionStorage.setItem('login_start_time', Date.now().toString());
            this.logInterruption('Login flow started');

            // 1. 获取 Web 登录地址
            const response = await fetch(`${this.API_BASE_URL}/soft_desktop/get_web_login_url`, { method: 'POST' });
            const result = await response.json();
            if (result.code !== 1) throw new Error(result.msg);
            const loginUrlBase = result.data.login_url;

            // 2. 生成带签名的 Nonce (通过 IPC 调用主进程处理安全签名)
            const signedData = await window.electronAPI.generateSignedNonce();
            const encodedNonce = this.encodeSignedNonce(signedData);

            // 3. 打开浏览器
            const finalLoginUrl = `${loginUrlBase}?client_type=desktop&client_nonce=${encodedNonce}`;
            window.electronAPI.openExternal(finalLoginUrl);

            // 4. 开始轮询
            this.startPolling(encodedNonce);
            return true;
        } catch (error) {
            this.clearLoginState();
            console.error('启动登录流程失败:', error);
            throw error;
        }
    }

    /**
     * 清除登录流程状态
     */
    clearLoginState() {
        sessionStorage.removeItem('login_in_progress');
        sessionStorage.removeItem('login_start_time');
    }

    /**
     * 检查登录流程是否中断
     * @param {boolean} isFocusEvent - 是否由窗口聚焦事件触发
     */
    checkLoginInterrupted(isFocusEvent = false) {
        const inProgress = sessionStorage.getItem('login_in_progress') === 'true';
        if (!inProgress) return false;

        const startTime = parseInt(sessionStorage.getItem('login_start_time') || '0');
        const now = Date.now();
        const duration = now - startTime;
        const timeout = 30000; // 30秒超时

        // 1. 检查硬超时
        if (duration > timeout) {
            this.logInterruption('Login timeout detected');
            this.stopPolling();
            this.clearLoginState();
            return true;
        }

        if (isFocusEvent) {
            if (duration > 1000) {
                this.logInterruption('Login interruption detected on window focus');
                this.stopPolling();
                this.clearLoginState();
                return true;
            }
            return false;
        }

        // 3. 检查非轮询状态下的标记残留（如刷新页面）
        if (!this.isPolling) {
            this.logInterruption('Login interruption detected after refresh/reopen');
            this.clearLoginState();
            return true;
        }

        return false;
    }

    /**
     * 记录中断日志
     */
    logInterruption(reason) {
        const logMsg = `[LOGIN_INTERRUPT] ${reason} at ${new Date().toLocaleString()}`;
        console.warn(logMsg);
        if (window.electronAPI && window.electronAPI.logMessage) {
            window.electronAPI.logMessage('warn', logMsg);
        }
    }

    /**
     * 编码 Nonce 为 URL 安全格式
     */
    encodeSignedNonce(signedData) {
        const jsonStr = JSON.stringify(signedData);
        // 使用 btoa 进行 Base64 编码，并处理 URL 安全字符
        let base64 = btoa(unescape(encodeURIComponent(jsonStr)));
        return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    }

    /**
     * 开启轮询 Token
     */
    startPolling(encodedNonce) {
        if (this.isPolling) return;
        if (this.loginTimeoutId) {
            clearTimeout(this.loginTimeoutId);
            this.loginTimeoutId = null;
        }
        this.isPolling = true;
        
        const poll = async () => {
            if (!this.isPolling) return;
            try {
                const response = await fetch(`${this.API_BASE_URL}/user/desktop_get_token`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: `client_type=desktop&client_nonce=${encodedNonce}`
                });
                const result = await response.json();
                
                if (result.code === 1) {
                    this.stopPolling();
                    this.clearLoginState();
                    this.token = result.data.token;
                    localStorage.setItem('login_token', this.token);
                    await this.fetchUserInfo();
                    // 触发自定义事件通知 UI 更新
                    window.dispatchEvent(new CustomEvent('login-success'));
                }
            } catch (error) {
                console.error('轮询 Token 失败:', error);
            }
        };

        this.pollInterval = setInterval(poll, 2000);
        this.loginTimeoutId = setTimeout(() => {
            if (this.isPolling) {
                this.stopPolling();
                this.clearLoginState();
                window.dispatchEvent(new CustomEvent('login-timeout'));
            }
        }, 30000);
    }

    stopPolling() {
        this.isPolling = false;
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
        if (this.loginTimeoutId) {
            clearTimeout(this.loginTimeoutId);
            this.loginTimeoutId = null;
        }
    }

    /**
     * 退出登录
     */
    async logout() {
        this.stopPolling();
        this.clearLoginState();
        if (this.token) {
            try {
                await fetch(`${this.API_BASE_URL}/logout`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'token': this.token
                    }
                });
            } catch (e) {}
        }
        this.token = null;
        this.userInfo = null;
        localStorage.removeItem('login_token');
        window.dispatchEvent(new CustomEvent('logout-success'));
    }
}

// 导出为全局单例
window.loginManager = new LoginManager();
