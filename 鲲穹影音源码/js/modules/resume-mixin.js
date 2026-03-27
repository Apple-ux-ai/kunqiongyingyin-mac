/**
 * 续播功能 mixin：记住与恢复播放进度
 */
const RESUME_STORAGE_KEY = 'playback_resume';
const RESUME_NEAR_END_SEC = 30;

function getDisplayNameFromKey(key) {
    if (!key) return '';
    if (key.startsWith('blob:')) return '';
    if (key.includes('\\') || (key.startsWith('/') && !key.startsWith('//'))) {
        return key.split(/[/\\]/).filter(Boolean).pop() || key;
    }
    try {
        const u = new URL(key);
        const path = u.pathname || '';
        const segment = path.split('/').filter(Boolean).pop();
        if (segment) return segment;
        return u.hostname || key.substring(0, 40);
    } catch (e) {
        return key.length > 40 ? key.substring(0, 40) + '…' : key;
    }
}

export default {
    getResumeKey(item) {
        if (!item) return '';
        return item.filePath || item.url || '';
    },

    getPlaybackPosition(key) {
        if (!this.rememberResume || !key) return null;
        try {
            const data = JSON.parse(localStorage.getItem(RESUME_STORAGE_KEY) || '{}');
            const entry = data[key];
            return (entry && typeof entry.position === 'number') ? entry.position : null;
        } catch (e) { return null; }
    },

    savePlaybackPosition(key, position, duration) {
        if (!this.rememberResume || !key) return;
        try {
            const data = JSON.parse(localStorage.getItem(RESUME_STORAGE_KEY) || '{}');
            data[key] = { position, duration, lastUpdated: Date.now() };
            const keys = Object.keys(data).sort((a, b) => (data[a].lastUpdated || 0) - (data[b].lastUpdated || 0));
            if (keys.length > this.RESUME_MAX_ENTRIES) {
                for (let i = 0; i < keys.length - this.RESUME_MAX_ENTRIES; i++) delete data[keys[i]];
            }
            localStorage.setItem(RESUME_STORAGE_KEY, JSON.stringify(data));
        } catch (e) { /* ignore */ }
    },

    /**
     * 获取上次未播放完的一条记录（lastUpdated 最大，且未接近结尾，且非 blob）
     */
    getLastUnfinishedEntry() {
        try {
            const data = JSON.parse(localStorage.getItem(RESUME_STORAGE_KEY) || '{}');
            const entries = Object.entries(data)
                .filter(([key]) => key && !key.startsWith('blob:'))
                .map(([key, val]) => ({
                    key,
                    position: val.position,
                    duration: val.duration,
                    lastUpdated: val.lastUpdated || 0
                }))
                .filter(e => typeof e.position === 'number' && typeof e.duration === 'number' && e.duration > 0 && e.position < e.duration - RESUME_NEAR_END_SEC)
                .sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0));
            if (entries.length === 0) return null;
            const first = entries[0];
            return {
                ...first,
                displayName: getDisplayNameFromKey(first.key)
            };
        } catch (e) {
            return null;
        }
    },

    /**
     * 启动时检查是否有未播放完的视频，若有则弹窗询问是否续播
     */
    async checkResumeOnStartup() {
        if (!this.rememberResume) return;
        const entry = this.getLastUnfinishedEntry();
        if (!entry) return;
        const t = typeof this.i18n !== 'undefined' && this.i18n.t ? this.i18n.t.bind(this.i18n) : (k, opts) => (opts && opts.name ? k.replace('{{name}}', opts.name) : k);
        const message = t('dialog.resume_prompt', { name: entry.displayName || entry.key });
        const btnYes = document.getElementById('resumePromptYes');
        const btnNo = document.getElementById('resumePromptNo');
        if (btnYes) btnYes.textContent = t('dialog.resume_yes');
        if (btnNo) btnNo.textContent = t('dialog.cancel');
        const confirmed = await this.showResumePrompt?.(message);
        if (!confirmed) return;
        this.resumeFromStartupKey = entry.key;
        const k = entry.key;
        const isLocalPath = !k.startsWith('http') && !k.startsWith('blob') && !k.startsWith('ftp') && !k.startsWith('file:') && (k.includes('\\') || (k.startsWith('/') && !k.startsWith('//')));
        if (isLocalPath) {
            this.addFileToPlaylist?.(k, true);
        } else {
            this.playUrl?.(k);
        }
    }
};
