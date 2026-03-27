import { Logger } from './logger.js';
import { Config } from './config.js';

export class PlayerEngine {
    constructor(player) {
        this.player = player;
        this.video = null;
        this.playlist = [];
        this.currentIndex = -1;
        this.isPlaying = false;
        this.playbackRate = Config.DEFAULT_PLAYBACK_RATE;
        this.volume = Config.DEFAULT_VOLUME;
        this.isMuted = false;
    }

    init(videoElement) {
        this.video = videoElement;
        this.setupVideoEvents();
    }

    setupVideoEvents() {
        if (!this.video) return;

        this.video.onplay = () => {
            this.isPlaying = true;
            this.player.ui.updatePlayPauseBtn(true);
        };

        this.video.onpause = () => {
            this.isPlaying = false;
            this.player.ui.updatePlayPauseBtn(false);
        };

        this.video.ontimeupdate = () => {
            this.player.ui.updateProgress(this.video.currentTime, this.video.duration);
        };

        this.video.onerror = (e) => {
            Logger.error('视频播放出错:', e);
            this.player.ui.showToast('视频播放出错', 'error');
        };
    }

    async loadVideo(videoData, index) {
        try {
            this.currentIndex = index;
            this.video.src = videoData.path;
            await this.video.play();
            Logger.info(`正在播放: ${videoData.name}`);
        } catch (error) {
            Logger.error('加载视频失败:', error);
        }
    }

    togglePlay() {
        if (!this.video.src) return;
        if (this.video.paused) {
            this.video.play();
        } else {
            this.video.pause();
        }
    }

    stop() {
        if (!this.video.src) return;
        this.video.pause();
        this.video.currentTime = 0;
        this.isPlaying = false;
    }

    seek(time) {
        if (!this.video.src) return;
        this.video.currentTime = time;
    }

    setVolume(value) {
        this.volume = value;
        this.video.volume = value / 100;
        this.isMuted = value === 0;
    }

    setPlaybackRate(rate) {
        this.playbackRate = rate;
        this.video.playbackRate = rate;
    }

    fastForward(seconds = Config.FAST_FORWARD_STEP) {
        if (!this.video.src) return;
        this.video.currentTime = Math.min(this.video.duration, this.video.currentTime + seconds);
    }

    rewind(seconds = Config.REWIND_STEP) {
        if (!this.video.src) return;
        this.video.currentTime = Math.max(0, this.video.currentTime - seconds);
    }

    playNext() {
        const nextIndex = (this.currentIndex + 1) % this.player.playlist.length;
        this.player.loadVideo(nextIndex);
    }

    playPrev() {
        const prevIndex = (this.currentIndex - 1 + this.player.playlist.length) % this.player.playlist.length;
        this.player.loadVideo(prevIndex);
    }
}
