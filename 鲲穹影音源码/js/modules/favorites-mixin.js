/**
 * 收藏/我的最爱 mixin
 * 依赖：this.playlist、this.currentIndex、this.getResumeKey、this.addFileToPlaylist、this.playUrl
 * 存储：localStorage key playback_favorites
 */
import { i18n } from './i18n.js';

const FAVORITES_STORAGE_KEY = 'playback_favorites';
const FAVORITES_MAX = 100;

export default {
    getFavorites() {
        try {
            const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
            const list = raw ? JSON.parse(raw) : [];
            return Array.isArray(list) ? list : [];
        } catch (e) {
            return [];
        }
    },

    saveFavorites(list) {
        try {
            const trimmed = list.slice(-FAVORITES_MAX);
            localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(trimmed));
        } catch (e) { /* ignore */ }
    },

    getFavoriteKey(entry) {
        if (!entry) return '';
        return entry.filePath || entry.url || '';
    },

    addToFavorites() {
        const item = this.playlist && this.currentIndex >= 0 && this.playlist[this.currentIndex]
            ? this.playlist[this.currentIndex]
            : null;
        if (!item) {
            this.showAlert?.(
                typeof this.i18n !== 'undefined' && this.i18n.t ? this.i18n.t('favorites.no_video') : '请先选择或播放视频',
                'info',
                typeof this.i18n !== 'undefined' && this.i18n.t ? this.i18n.t('favorites.title') : '收藏'
            );
            return;
        }
        const key = this.getResumeKey(item);
        if (!key) {
            this.showAlert?.(
                typeof this.i18n !== 'undefined' && this.i18n.t ? this.i18n.t('favorites.cannot_save') : '无法收藏该条目',
                'info',
                '收藏'
            );
            return;
        }
        const list = this.getFavorites();
        const existing = list.findIndex(e => this.getFavoriteKey(e) === key);
        const entry = {
            filePath: item.filePath || undefined,
            url: item.url && !item.filePath ? item.url : undefined,
            name: item.name || '未命名',
            addedAt: Date.now()
        };
        if (existing >= 0) {
            list[existing] = entry;
        } else {
            list.push(entry);
        }
        this.saveFavorites(list);
        this.renderFavoritesUI?.();
        this.showMessage?.(
            typeof this.i18n !== 'undefined' && this.i18n.t ? this.i18n.t('favorites.added') : '已加入收藏',
            'success'
        );
    },

    removeFromFavorites(index) {
        const list = this.getFavorites();
        if (index < 0 || index >= list.length) return;
        list.splice(index, 1);
        this.saveFavorites(list);
        this.renderFavoritesUI?.();
    },

    playFavorite(entry) {
        if (!entry) return;
        if (entry.filePath) {
            this.addFileToPlaylist?.(entry.filePath, true);
        } else if (entry.url) {
            this.playUrl?.(entry.url);
        } else {
            this.showAlert?.(
                typeof this.i18n !== 'undefined' && this.i18n.t ? this.i18n.t('favorites.invalid_entry') : '无效的收藏项',
                'info',
                '收藏'
            );
        }
    },

    switchToFavoritesTab() {
        const playlistTab = document.querySelector('.playlist-tab[data-tab="playlist"]');
        const favoritesTab = document.querySelector('.playlist-tab[data-tab="favorites"]');
        const recentTab = document.querySelector('.playlist-tab[data-tab="recent"]');
        const playlistContent = document.getElementById('playlistContent');
        const favoritesContent = document.getElementById('favoritesContent');
        const recentContent = document.getElementById('recentContent');
        const toolbar = document.querySelector('.playlist-toolbar');
        if (!favoritesTab || !favoritesContent) return;
        if (playlistTab) playlistTab.classList.remove('active');
        if (recentTab) recentTab.classList.remove('active');
        favoritesTab.classList.add('active');
        if (playlistContent) playlistContent.style.display = 'none';
        if (recentContent) recentContent.style.display = 'none';
        favoritesContent.style.display = 'block';
        if (toolbar) toolbar.style.display = 'none';
        this.playlistPanel?.classList.remove('hidden');
        this.renderFavoritesUI?.();
    },

    switchToPlaylistTab() {
        const playlistTab = document.querySelector('.playlist-tab[data-tab="playlist"]');
        const favoritesTab = document.querySelector('.playlist-tab[data-tab="favorites"]');
        const recentTab = document.querySelector('.playlist-tab[data-tab="recent"]');
        const playlistContent = document.getElementById('playlistContent');
        const favoritesContent = document.getElementById('favoritesContent');
        const recentContent = document.getElementById('recentContent');
        const toolbar = document.querySelector('.playlist-toolbar');
        if (!playlistTab || !playlistContent) return;
        if (favoritesTab) favoritesTab.classList.remove('active');
        if (recentTab) recentTab.classList.remove('active');
        playlistTab.classList.add('active');
        if (favoritesContent) favoritesContent.style.display = 'none';
        if (recentContent) recentContent.style.display = 'none';
        playlistContent.style.display = 'block';
        if (toolbar) toolbar.style.display = '';
    },

    renderFavoritesUI() {
        const container = document.getElementById('favoritesContent');
        if (!container) return;
        const list = this.getFavorites();
        const t = (typeof this.i18n !== 'undefined' && this.i18n && this.i18n.t) ? this.i18n.t.bind(this.i18n) : (typeof i18n !== 'undefined' && i18n && i18n.t) ? i18n.t.bind(i18n) : (k) => k;
        if (list.length === 0) {
            container.innerHTML = `
                <div class="playlist-empty">
                    <i class="fas fa-heart"></i>
                    <p>${t('favorites.empty')}</p>
                    <p class="empty-tip">${t('favorites.empty_tip')}</p>
                </div>
            `;
            return;
        }
        container.innerHTML = '';
        list.forEach((entry, index) => {
            const div = document.createElement('div');
            div.className = 'playlist-item favorite-item';
            div.innerHTML = `
                <div class="playlist-item-header">
                    <div class="playlist-item-num">${(index + 1).toString().padStart(2, '0')}</div>
                    <div class="playlist-item-name" title="${(entry.name || '').replace(/"/g, '&quot;')}">${(entry.name || '未命名').replace(/</g, '&lt;')}</div>
                    <button class="playlist-item-delete favorite-remove" title="${t('favorites.remove')}">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
            div.addEventListener('click', (e) => {
                if (!e.target.closest('.playlist-item-delete')) {
                    this.playFavorite(entry);
                }
            });
            div.querySelector('.playlist-item-delete').addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeFromFavorites(index);
            });
            container.appendChild(div);
        });
    },

    initFavorites() {
        const playlistTab = document.querySelector('.playlist-tab[data-tab="playlist"]');
        const favoritesTab = document.querySelector('.playlist-tab[data-tab="favorites"]');
        const favoritesContent = document.getElementById('favoritesContent');
        if (playlistTab) {
            playlistTab.addEventListener('click', () => this.switchToPlaylistTab?.());
        }
        if (favoritesTab) {
            favoritesTab.addEventListener('click', () => this.switchToFavoritesTab?.());
        }
        if (favoritesContent) {
            favoritesContent.style.display = 'none';
        }
        this.renderFavoritesUI?.();
    }
};
