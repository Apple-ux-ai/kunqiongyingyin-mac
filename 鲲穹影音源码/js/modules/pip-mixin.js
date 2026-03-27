/**
 * 画中画（Picture-in-Picture）mixin
 * 依赖：this.video（主视频元素）
 * 不修改播放、字幕、截图等逻辑，仅对同一 video 做 PiP 进出。
 */
export default {
    isPipActive: false,

    initPip() {
        if (!this.video) return;
        this.video.addEventListener('enterpictureinpicture', () => {
            this.isPipActive = true;
            this.updatePipUI?.();
        });
        this.video.addEventListener('leavepictureinpicture', () => {
            this.isPipActive = false;
            this.updatePipUI?.();
        });
    },

    updatePipUI() {
        const btn = document.getElementById('pipBtn');
        const text = document.getElementById('contextPipText');
        const t = typeof this.i18n !== 'undefined' && this.i18n.t ? this.i18n.t.bind(this.i18n) : (key) => key;
        if (btn) btn.classList.toggle('active', this.isPipActive);
        if (text) text.textContent = t(this.isPipActive ? 'context_menu.exit_pip' : 'context_menu.pip');
    },

    isPipSupported() {
        return typeof document !== 'undefined' &&
            document.pictureInPictureEnabled &&
            this.video &&
            !this.video.disablePictureInPicture;
    },

    async togglePip() {
        if (!this.video) return;
        if (!this.isPipSupported()) {
            this.showAlert?.(
                typeof this.i18n !== 'undefined' && this.i18n.t
                    ? this.i18n.t('context_menu.pip_unsupported')
                    : '当前环境不支持画中画',
                'info',
                typeof this.i18n !== 'undefined' && this.i18n.t
                    ? this.i18n.t('context_menu.pip')
                    : '画中画'
            );
            return;
        }
        const hasVideo = this.video.readyState >= 1 && this.video.duration != null && isFinite(this.video.duration);
        if (!hasVideo && !document.pictureInPictureElement) {
            this.showAlert?.(
                typeof this.i18n !== 'undefined' && this.i18n.t
                    ? this.i18n.t('context_menu.pip_no_video')
                    : '请先添加并播放视频文件',
                'info',
                typeof this.i18n !== 'undefined' && this.i18n.t
                    ? this.i18n.t('context_menu.pip')
                    : '画中画'
            );
            return;
        }
        try {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
            } else {
                await this.video.requestPictureInPicture();
            }
        } catch (err) {
            const msg = err && err.message ? err.message : '画中画操作失败';
            this.showAlert?.(msg, 'error', '画中画');
        }
    }
};
