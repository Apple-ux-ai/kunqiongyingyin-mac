/**
 * 鲲穹AI播放器 - 全局配置
 */
export const Config = {
    VERSION: 'v5.76.0209.1111',
    DEFAULT_VOLUME: 100,
    DEFAULT_PLAYBACK_RATE: 1.0,
    FAST_FORWARD_STEP: 1, // 快进步长(秒)
    REWIND_STEP: 1,      // 快退步长(秒)
    SPEED_STEP: 0.25,    // 加速/减速步长(倍)
    
    // 播放核心
    CORES: {
        FFMPEG: 'ffmpeg',
        DIRECT_SHOW: 'directshow',
        QUICKTIME: 'quicktime',
        MPLAYER: 'mplayer'
    },
    
    // 默认设置
    DEFAULTS: {
        CORE: 'ffmpeg',
        SPLITTER: 'auto',
        VIDEO_DECODER: 'auto',
        AUDIO_DECODER: 'auto',
        RENDERER: 'auto'
    },
    
    // 热键默认映射
    HOTKEYS: {
        playPause: ' ',
        stop: 'Ctrl+S',
        fastForward: 'ArrowRight',
        rewind: 'ArrowLeft',
        speedUp: 'Ctrl+ArrowUp',
        speedDown: 'Ctrl+ArrowDown',
        volumeUp: 'ArrowUp',
        volumeDown: 'ArrowDown',
        mute: 'M',
        fullscreen: 'F',
        exitFullscreen: 'Escape',
        lightsOff: 'L',
        openUrl: 'Ctrl+U',
        openFile: 'Ctrl+O'
    },
    
    // 截图设置
    SCREENSHOT: {
        PREFIX: '鲲穹截图',
        FORMAT: 'png',
        QUALITY: 0.9
    }
};
