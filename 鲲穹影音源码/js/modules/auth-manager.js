/**
 * 鲲穹AI播放器 - 授权管理模块
 */
import { Logger } from './logger.js';

export class AuthManager {
    constructor(player) {
        this.player = player;
        this.isAuthorized = true; // 测试模式：默认已授权
        this.authCodeUrl = '';
        this.lastAuthCode = '';
    }

    async init() {
        this.isAuthorized = true;
        return true;
    }

    async ensureAuthorized() {
        return true;
    }

    showAuthDialog() {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'auth-overlay';
            
            overlay.innerHTML = `
                <div class="auth-dialog">
                    <button class="auth-close-btn" title="关闭 (Esc)">×</button>
                    <div class="auth-header">
                        <img src="鲲穹AI播放器.png" class="auth-logo" alt="Logo">
                        <h2 class="auth-title">鲲穹AI工具箱 · 软件授权验证</h2>
                    </div>
                    <p class="auth-desc">您当前安装的工具为鲲穹AI工具箱生态应用，需通过工具箱授权码完成激活，以启用完整功能。</p>
                    
                    <div class="auth-input-container">
                        <input type="password" class="auth-input" id="authCodeInput" 
                               placeholder="请输入授权码" maxlength="8" value="${this.lastAuthCode}">
                        <button class="auth-toggle-password" id="togglePassword" title="显示/隐藏">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                    
                    <button class="auth-verify-btn" id="verifyBtn">验证授权</button>
                    
                    <div class="auth-error-msg" id="authMsg"></div>
                    
                    <a class="auth-link-btn" id="getAuthBtn">还没有授权码？点击获取</a>
                </div>
            `;

            document.body.appendChild(overlay);
            setTimeout(() => overlay.classList.add('active'), 10);

            const input = overlay.querySelector('#authCodeInput');
            const verifyBtn = overlay.querySelector('#verifyBtn');
            const closeBtn = overlay.querySelector('.auth-close-btn');
            const toggleBtn = overlay.querySelector('#togglePassword');
            const getAuthBtn = overlay.querySelector('#getAuthBtn');
            const authMsg = overlay.querySelector('#authMsg');

            const closeDialog = () => {
                this.lastAuthCode = input.value;
                overlay.classList.remove('active');
                setTimeout(() => {
                    if (overlay.parentNode) document.body.removeChild(overlay);
                    resolve();
                }, 300);
            };

            const escHandler = (e) => {
                if (e.key === 'Escape') {
                    closeDialog();
                    document.removeEventListener('keydown', escHandler);
                }
            };
            document.addEventListener('keydown', escHandler);

            toggleBtn.onclick = () => {
                const isPassword = input.type === 'password';
                input.type = isPassword ? 'text' : 'password';
                toggleBtn.innerHTML = isPassword ? '<i class="fas fa-eye-slash"></i>' : '<i class="fas fa-eye"></i>';
            };

            getAuthBtn.onclick = () => {
                window.electronAPI.auth.openUrl(this.authCodeUrl);
                authMsg.style.color = '#0078d4';
                authMsg.textContent = '已在浏览器中打开授权码获取页面';
            };

            verifyBtn.onclick = async () => {
                const code = input.value.trim().toUpperCase();
                if (code.length < 4) {
                    authMsg.style.color = '#ef4444';
                    authMsg.textContent = '请输入有效的授权码';
                    return;
                }

                verifyBtn.disabled = true;
                verifyBtn.textContent = '验证中...';
                
                try {
                    const result = await window.electronAPI.auth.verifyCode(code);
                    if (result.success && result.isValid) {
                        this.isAuthorized = true;
                        authMsg.style.color = '#10b981';
                        authMsg.textContent = '授权成功！';
                        setTimeout(closeDialog, 1000);
                    } else {
                        authMsg.style.color = '#ef4444';
                        authMsg.textContent = result.msg || '授权码无效，请重试';
                        verifyBtn.disabled = false;
                        verifyBtn.textContent = '验证授权';
                    }
                } catch (error) {
                    authMsg.style.color = '#ef4444';
                    authMsg.textContent = '网络验证失败，请检查网络连接';
                    verifyBtn.disabled = false;
                    verifyBtn.textContent = '验证授权';
                }
            };

            closeBtn.onclick = closeDialog;
            input.onkeypress = (e) => { if (e.key === 'Enter') verifyBtn.click(); };
            input.focus();
        });
    }
}
