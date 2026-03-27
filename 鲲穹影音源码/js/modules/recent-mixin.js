/**
 * 最近播放 mixin：只读 playback_resume，按 lastUpdated 展示列表，点击即播
 * 删除仅从“最近播放”隐藏（写入 recent_hidden），不修改续播数据
 */
import { i18n } from './i18n.js';

const RECENT_STORAGE_KEY = 'playback_resume';
const RECENT_HIDDEN_KEY = 'playback_recent_hidden';
const RECENT_MAX = 20;

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
    recentSelectedKeys: null,

    getRecentHiddenKeys() {
        try {
            const raw = localStorage.getItem(RECENT_HIDDEN_KEY);
            const arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr : [];
        } catch (e) {
            return [];
        }
    },

    setRecentHiddenKeys(keys) {
        try {
            localStorage.setItem(RECENT_HIDDEN_KEY, JSON.stringify(keys));
        } catch (e) { /* ignore */ }
    },

    getRecentList() {
        try {
            const hidden = this.getRecentHiddenKeys?.() || [];
            const hiddenSet = new Set(hidden);
            const data = JSON.parse(localStorage.getItem(RECENT_STORAGE_KEY) || '{}');
            const entries = Object.entries(data)
                .filter(([key]) => key && !key.startsWith('blob:') && !hiddenSet.has(key))
                .map(([key, val]) => ({
                    key,
                    lastUpdated: val.lastUpdated || 0,
                    displayName: getDisplayNameFromKey(key)
                }))
                .sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0))
                .slice(0, RECENT_MAX);
            return entries;
        } catch (e) {
            return [];
        }
    },

    clearRecentList() {
        const list = this.getRecentList();
        if (list.length === 0) return;
        const hidden = this.getRecentHiddenKeys?.() || [];
        const addKeys = list.map(e => e.key);
        this.setRecentHiddenKeys?.([...new Set([...hidden, ...addKeys])]);
        this.recentSelectedKeys = new Set();
        this.renderRecentUI?.();
    },

    removeSelectedFromRecent() {
        if (!this.recentSelectedKeys || this.recentSelectedKeys.size === 0) return;
        const hidden = this.getRecentHiddenKeys?.() || [];
        const addKeys = Array.from(this.recentSelectedKeys);
        this.setRecentHiddenKeys?.([...new Set([...hidden, ...addKeys])]);
        this.recentSelectedKeys = new Set();
        this.renderRecentUI?.();
    },

    playRecentEntry(entry) {
        if (!entry || !entry.key) return;
        const k = entry.key;
        const isLocalPath = !k.startsWith('http') && !k.startsWith('blob') && !k.startsWith('ftp') && !k.startsWith('file:') && (k.includes('\\') || (k.startsWith('/') && !k.startsWith('//')));
        if (isLocalPath) {
            this.addFileToPlaylist?.(k, true);
        } else {
            this.playUrl?.(k);
        }
    },

    switchToRecentTab() {
        const playlistTab = document.querySelector('.playlist-tab[data-tab="playlist"]');
        const favoritesTab = document.querySelector('.playlist-tab[data-tab="favorites"]');
        const recentTab = document.querySelector('.playlist-tab[data-tab="recent"]');
        const playlistContent = document.getElementById('playlistContent');
        const favoritesContent = document.getElementById('favoritesContent');
        const recentContent = document.getElementById('recentContent');
        const toolbar = document.querySelector('.playlist-toolbar');
        if (!recentTab || !recentContent) return;
        if (playlistTab) playlistTab.classList.remove('active');
        if (favoritesTab) favoritesTab.classList.remove('active');
        recentTab.classList.add('active');
        if (playlistContent) playlistContent.style.display = 'none';
        if (favoritesContent) favoritesContent.style.display = 'none';
        recentContent.style.display = 'block';
        if (toolbar) toolbar.style.display = 'none';
        this.playlistPanel?.classList.remove('hidden');
        this.renderRecentUI?.();
    },

    renderRecentUI() {
        const container = document.getElementById('recentContent');
        if (!container) return;
        if (this.recentSelectedKeys == null) this.recentSelectedKeys = new Set();
        const list = this.getRecentList();
        const t = (typeof this.i18n !== 'undefined' && this.i18n && this.i18n.t) ? this.i18n.t.bind(this.i18n) : (typeof i18n !== 'undefined' && i18n && i18n.t) ? i18n.t.bind(i18n) : (k) => k;
        if (list.length === 0) {
            this.recentSelectedKeys = new Set();
            container.innerHTML = `
                <div class="playlist-empty">
                    <i class="fas fa-clock"></i>
                    <p>${t('recent.empty')}</p>
                    <p class="empty-tip">${t('recent.empty_tip')}</p>
                </div>
            `;
            return;
        }
        container.innerHTML = '';
        const toolbar = document.createElement('div');
        toolbar.className = 'recent-toolbar';
        const btnClear = document.createElement('button');
        btnClear.type = 'button';
        btnClear.className = 'playlist-btn recent-clear-btn';
        btnClear.textContent = t('recent.clear_all');
        btnClear.addEventListener('click', (e) => { e.stopPropagation(); this.clearRecentList?.(); });
        const btnRemove = document.createElement('button');
        btnRemove.type = 'button';
        btnRemove.className = 'playlist-btn recent-remove-btn';
        btnRemove.textContent = t('recent.remove_selected');
        const updateRemoveBtn = () => {
            btnRemove.disabled = !this.recentSelectedKeys || this.recentSelectedKeys.size === 0;
        };
        btnRemove.addEventListener('click', (e) => { e.stopPropagation(); this.removeSelectedFromRecent?.(); });
        toolbar.appendChild(btnClear);
        toolbar.appendChild(btnRemove);
        container.appendChild(toolbar);
        list.forEach((entry, index) => {
            const div = document.createElement('div');
            div.className = 'playlist-item recent-item';
            const name = (entry.displayName || entry.key || '').replace(/</g, '&lt;').replace(/"/g, '&quot;');
            const checked = this.recentSelectedKeys && this.recentSelectedKeys.has(entry.key);
            div.innerHTML = `
                <div class="playlist-item-header">
                    <label class="recent-item-checkbox" onclick="event.stopPropagation();">
                        <input type="checkbox" class="recent-checkbox" ${checked ? 'checked' : ''}>
                    </label>
                    <div class="playlist-item-num">${(index + 1).toString().padStart(2, '0')}</div>
                    <div class="playlist-item-name" title="${name}">${name || '—'}</div>
                </div>
            `;
            div.addEventListener('click', (e) => {
                if (e.target.closest('.recent-item-checkbox')) return;
                this.playRecentEntry(entry);
            });
            const cb = div.querySelector('.recent-checkbox');
            if (cb) {
                cb.addEventListener('change', () => {
                    if (!this.recentSelectedKeys) this.recentSelectedKeys = new Set();
                    if (cb.checked) this.recentSelectedKeys.add(entry.key);
                    else this.recentSelectedKeys.delete(entry.key);
                    updateRemoveBtn();
                });
            }
            container.appendChild(div);
        });
        updateRemoveBtn();
    },

    initRecent() {
        const recentTab = document.querySelector('.playlist-tab[data-tab="recent"]');
        const recentContent = document.getElementById('recentContent');
        if (recentTab) {
            recentTab.addEventListener('click', () => this.switchToRecentTab?.());
        }
        if (recentContent) {
            recentContent.style.display = 'none';
        }
        this.renderRecentUI?.();
    }
};
