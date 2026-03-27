import { Logger } from './logger.js';
import { Config } from './config.js';

export class UIManager {
    constructor(player) {
        this.player = player;
        this.elements = {};
    }

    init() {
        this.cacheElements();
        this.initTooltips();
    }

    cacheElements() {
        this.elements = {
            video: document.getElementById('mainVideo'),
            playPauseBtn: document.querySelector('.play-pause-btn'),
            stopBtn: document.querySelector('.stop-btn'),
            prevBtn: document.querySelector('.prev-btn'),
            nextBtn: document.querySelector('.next-btn'),
            progressSlider: document.querySelector('.progress-slider'),
            currentTime: document.querySelector('.current-time'),
            totalTime: document.querySelector('.total-time'),
            volumeSlider: document.querySelector('.volume-slider'),
            volumeBtn: document.querySelector('.volume-btn'),
            speedBtn: document.querySelector('.speed-btn'),
            fullscreenBtn: document.querySelector('.fullscreen-btn'),
            playlistContainer: document.querySelector('.playlist-items'),
            loadingOverlay: document.querySelector('.loading-overlay'),
            toast: document.getElementById('toast')
        };
    }

    initTooltips() {
        // 初始化工具提示逻辑
    }

    updatePlayPauseBtn(isPlaying) {
        const icon = this.elements.playPauseBtn.querySelector('i');
        if (isPlaying) {
            icon.className = 'fas fa-pause';
            this.elements.playPauseBtn.title = '暂停 (Space)';
        } else {
            icon.className = 'fas fa-play';
            this.elements.playPauseBtn.title = '播放 (Space)';
        }
    }

    updateProgress(current, duration) {
        if (!duration) return;
        const percent = (current / duration) * 100;
        this.elements.progressSlider.value = percent;
        this.elements.currentTime.textContent = this.formatTime(current);
        this.elements.totalTime.textContent = this.formatTime(duration);
    }

    formatTime(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    showToast(message, type = 'info') {
        const toast = this.elements.toast;
        toast.textContent = message;
        toast.className = `toast ${type} show`;
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    updatePlaylist(playlist, currentIndex) {
        this.elements.playlistContainer.innerHTML = '';
        playlist.forEach((item, index) => {
            const el = document.createElement('div');
            el.className = `playlist-item ${index === currentIndex ? 'active' : ''}`;
            el.innerHTML = `
                <span class="item-index">${index + 1}</span>
                <span class="item-name">${item.name}</span>
            `;
            el.onclick = () => this.player.loadVideo(index);
            this.elements.playlistContainer.appendChild(el);
        });
    }

    setLoading(isLoading) {
        if (this.elements.loadingOverlay) {
            this.elements.loadingOverlay.style.display = isLoading ? 'flex' : 'none';
        }
    }
}
