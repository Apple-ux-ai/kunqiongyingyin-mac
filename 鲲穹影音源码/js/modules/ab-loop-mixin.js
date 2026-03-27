/**
 * A-B 段循环 mixin
 * 依赖：this.video（主视频元素）、this.formatTime（可选，用于 UI 显示）
 * 不修改播放、续播、进度条等逻辑，仅在 timeupdate 时在 B 点 seek 回 A 点。
 */
const MIN_AB_SECONDS = 0.5;
const SEEK_COOLDOWN_MS = 300;

export default {
    abLoopEnabled: false,
    abPointA: null,
    abPointB: null,
    _lastABSeekTime: 0,

    initABLoop() {
        if (!this.video) return;
        this.video.addEventListener('timeupdate', () => this.checkABLoop());
    },

    checkABLoop() {
        if (!this.video || !this.abLoopEnabled || this.abPointA == null || this.abPointB == null) return;
        const d = this.video.duration;
        if (!d || !isFinite(d)) return;
        const t = this.video.currentTime;
        if (t < this.abPointB) return;
        if (Date.now() - this._lastABSeekTime < SEEK_COOLDOWN_MS) return;
        this._lastABSeekTime = Date.now();
        this.video.currentTime = this.abPointA;
    },

    setABPointA() {
        if (!this.video || !this.video.duration || !isFinite(this.video.duration)) {
            this.showAlert?.(
                typeof this.i18n !== 'undefined' && this.i18n.t ? this.i18n.t('ab_loop.no_video') : '请先播放视频',
                'info',
                'A-B 段'
            );
            return;
        }
        this.abPointA = this.video.currentTime;
        if (this.abPointB != null && this.abPointB <= this.abPointA + MIN_AB_SECONDS) {
            this.abPointB = null;
        }
        this.updateABLoopUI?.();
    },

    setABPointB() {
        if (!this.video || !this.video.duration || !isFinite(this.video.duration)) {
            this.showAlert?.(
                typeof this.i18n !== 'undefined' && this.i18n.t ? this.i18n.t('ab_loop.no_video') : '请先播放视频',
                'info',
                'A-B 段'
            );
            return;
        }
        const t = this.video.currentTime;
        if (this.abPointA != null && t <= this.abPointA + MIN_AB_SECONDS) {
            this.showAlert?.(
                typeof this.i18n !== 'undefined' && this.i18n.t ? this.i18n.t('ab_loop.b_after_a') : 'B 点须在 A 点之后',
                'info',
                'A-B 段'
            );
            return;
        }
        this.abPointB = t;
        this.updateABLoopUI?.();
    },

    clearABLoop() {
        this.abPointA = null;
        this.abPointB = null;
        this.abLoopEnabled = false;
        this._lastABSeekTime = 0;
        this.updateABLoopUI?.();
    },

    toggleABLoop() {
        if (this.abPointA == null || this.abPointB == null) {
            this.showAlert?.(
                typeof this.i18n !== 'undefined' && this.i18n.t ? this.i18n.t('ab_loop.set_ab_first') : '请先设置 A 点和 B 点',
                'info',
                'A-B 段'
            );
            return;
        }
        this.abLoopEnabled = !this.abLoopEnabled;
        this.updateABLoopUI?.();
    },

    updateABLoopUI() {
        const t = typeof this.i18n !== 'undefined' && this.i18n.t ? this.i18n.t.bind(this.i18n) : (k) => k;
        const fmt = typeof this.formatTime === 'function'
            ? (s) => (s == null ? '--' : this.formatTime(s))
            : (s) => (s == null ? '--' : String(Number(s).toFixed(1)));
        const setAText = document.getElementById('contextABSetAText');
        const setBText = document.getElementById('contextABSetBText');
        const clearText = document.getElementById('contextABClearText');
        const toggleText = document.getElementById('contextABToggleText');
        if (setAText) setAText.textContent = t('ab_loop.set_a') + (this.abPointA != null ? ` (${fmt(this.abPointA)})` : '');
        if (setBText) setBText.textContent = t('ab_loop.set_b') + (this.abPointB != null ? ` (${fmt(this.abPointB)})` : '');
        if (clearText) clearText.textContent = t('ab_loop.clear');
        if (toggleText) toggleText.textContent = this.abLoopEnabled ? t('ab_loop.toggle_off') : t('ab_loop.toggle_on');

        // 在进度条上更新 A/B 点标识位置与显示
        const markerA = document.getElementById('progressAbMarkerA');
        const markerB = document.getElementById('progressAbMarkerB');
        const duration = this.video?.duration;
        const hasDuration = duration != null && isFinite(duration) && duration > 0;
        if (markerA) {
            if (this.abPointA != null && hasDuration) {
                markerA.style.left = (this.abPointA / duration * 100) + '%';
                markerA.style.display = 'block';
            } else {
                markerA.style.display = 'none';
            }
        }
        if (markerB) {
            if (this.abPointB != null && hasDuration) {
                markerB.style.left = (this.abPointB / duration * 100) + '%';
                markerB.style.display = 'block';
            } else {
                markerB.style.display = 'none';
            }
        }
    }
};
