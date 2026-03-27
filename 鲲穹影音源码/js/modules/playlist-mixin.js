/**
 * 播放列表 UI 与模式 mixin
 */
import { i18n } from './i18n.js';

export default {
    updatePlaylistUI() {
        if (this.playlist.length === 0) {
            const emptyText = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('playlist.empty') : '播放列表为空';
            const emptyTipText = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('playlist.empty_tip') : '点击"添加"按钮或拖放文件到此处';
            this.playlistContent.innerHTML = `
                <div class="playlist-empty">
                    <i class="fas fa-list-ul"></i>
                    <p>${emptyText}</p>
                    <p class="empty-tip">${emptyTipText}</p>
                </div>
            `;
            return;
        }

        this.playlistContent.innerHTML = '';
        this.playlist.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = 'playlist-item' + (index === this.currentIndex ? ' active' : '');
            div.innerHTML = `
                <div class="playlist-item-header">
                    <div class="playlist-item-num">${(index + 1).toString().padStart(2, '0')}</div>
                    <div class="playlist-item-name" title="${item.name}">${item.name}</div>
                    <button class="playlist-item-delete">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="playlist-item-info">${this.formatFileSize(item.size)}</div>
            `;

            div.addEventListener('click', (e) => {
                if (!e.target.closest('.playlist-item-delete')) {
                    this.loadVideo(index);
                }
            });

            div.querySelector('.playlist-item-delete').addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeFromPlaylist(index);
            });

            this.playlistContent.appendChild(div);
        });
    },

    removeFromPlaylist(index) {
        if (index === this.currentIndex) {
            this.stop();
        }

        this.playlist.splice(index, 1);

        if (index < this.currentIndex) {
            this.currentIndex--;
        } else if (index === this.currentIndex) {
            this.currentIndex = -1;
        }

        if (this.playlist.length === 0 && this.videoInfoOverlay) {
            this.videoInfoOverlay.classList.remove('active');
            this.videoInfoOverlay.textContent = '';
        }

        this.updatePlaylistUI();
    },

    async clearPlaylist() {
        if (this.playlist.length === 0) return;

        const confirmed = await this.showConfirm('确定要清空播放列表吗？', 'warning', '清空确认');
        if (confirmed) {
            this.playlist = [];
            this.currentIndex = -1;
            this.stop();
            if (this.videoInfoOverlay) {
                this.videoInfoOverlay.classList.remove('active');
                this.videoInfoOverlay.textContent = '';
            }
        }
    },

    togglePlaylist() {
        this.playlistPanel.classList.toggle('hidden');
    },

    togglePlayMode() {
        const modes = ['loop-list', 'loop-single', 'random'];
        const currentModeIndex = modes.indexOf(this.playMode);
        const nextModeIndex = (currentModeIndex + 1) % modes.length;
        this.playMode = modes[nextModeIndex];

        this.updatePlayModeButton();
        this.saveSettings();

        const modeNames = {
            'loop-list': '列表循环播放',
            'loop-single': '单曲循环播放',
            'random': '随机播放'
        };
        console.log(`播放模式已切换为: ${modeNames[this.playMode]}`);
    },

    updatePlayModeButton() {
        const modeConfig = {
            'loop-list': {
                icon: 'fa-repeat',
                textKey: 'playlist.loop_list',
                titleKey: 'playlist.loop_list_title',
                class: 'loop-list'
            },
            'loop-single': {
                icon: 'fa-redo-alt',
                textKey: 'playlist.loop_single',
                titleKey: 'playlist.loop_single_title',
                class: 'loop-single'
            },
            'random': {
                icon: 'fa-random',
                textKey: 'playlist.random',
                titleKey: 'playlist.random_title',
                class: 'random'
            }
        };

        const config = modeConfig[this.playMode];

        this.playModeBtn.classList.remove('loop-list', 'loop-single', 'random');
        this.playModeBtn.classList.add(config.class);

        const text = typeof i18n !== 'undefined' && i18n.t ? i18n.t(config.textKey) : config.textKey;
        const title = typeof i18n !== 'undefined' && i18n.t ? i18n.t(config.titleKey) : config.titleKey;
        this.playModeBtn.innerHTML = `<i class="fas ${config.icon}"></i> <span>${text}</span>`;
        this.playModeBtn.title = title;
    },

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
};
