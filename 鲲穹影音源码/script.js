import { Config } from './js/modules/config.js';
import { Logger } from './js/modules/logger.js';
import { AuthManager } from './js/modules/auth-manager.js';
import { PlayerEngine } from './js/modules/player-engine.js';
import { UIManager } from './js/modules/ui-manager.js';
import { i18n } from './js/modules/i18n.js';
import resumeMixin from './js/modules/resume-mixin.js';
import playlistMixin from './js/modules/playlist-mixin.js';
import dlnaMixin from './js/modules/dlna-mixin.js';
import hotkeysMixin from './js/modules/hotkeys-mixin.js';
import pipMixin from './js/modules/pip-mixin.js';
import abLoopMixin from './js/modules/ab-loop-mixin.js';
import favoritesMixin from './js/modules/favorites-mixin.js';
import recentMixin from './js/modules/recent-mixin.js';

export class BaofengPlayer {
    constructor() {
        // 初始化核心模块
        this.log = Logger;
        this.config = Config;
        this.ui = new UIManager(this);
        this.engine = new PlayerEngine(this);
        this.auth = new AuthManager(this);

        // 基础状态迁移（部分保留在主类以兼容旧代码）
        this.playlist = [];
        this.currentIndex = -1;
        this.isPlaying = false;
        this.volume = Config.DEFAULT_VOLUME;
        this.playbackRate = Config.DEFAULT_PLAYBACK_RATE;
        this.fastForwardStep = Config.FAST_FORWARD_STEP;
        this.rewindStep = Config.REWIND_STEP;
        this.speedStep = Config.SPEED_STEP;
        this.playMode = 'loop-list'; // 默认播放模式：列表循环
        
        // 核心设置状态
        this.currentCore = Config.DEFAULTS.CORE;
        this.currentSplitter = Config.DEFAULTS.SPLITTER;
        this.currentVideoDecoder = Config.DEFAULTS.VIDEO_DECODER;
        this.currentAudioDecoder = Config.DEFAULTS.AUDIO_DECODER;
        this.currentRenderer = Config.DEFAULTS.RENDERER;
        
        // 热键映射
        this.hotkeys = { ...Config.HOTKEYS };
        this.hotkeysDraft = null;
        
        // 画质调节参数
        this.brightness = 100;
        this.contrast = 100;
        this.saturation = 100;
        this.hue = 0;
        this.rotation = 0;
        this.flipH = false;
        this.flipV = false;
        this.panX = 0;
        this.panY = 0;
        this.scale = 1;
        this.currentAspectRatio = 'original'; // 当前画面比例模式
        
        // 截图设置
        this.screenshotPrefix = Config.SCREENSHOT.PREFIX;
        this.screenshotFormat = Config.SCREENSHOT.FORMAT;
        this.jpegQuality = Config.SCREENSHOT.QUALITY;
        this.screenshotPath = localStorage.getItem('screenshot_path') || '';
        this.screenshotAutoPopup = true;
        this.screenshotNoPopup = false;
        
        // 续播：记住播放进度
        this.rememberResume = true;
        this.resumeSaveThrottle = 0;
        this.RESUME_SAVE_INTERVAL = 150; // timeupdate 约每 250ms，150 次约 37.5 秒保存一次
        this.RESUME_MAX_ENTRIES = 100;
        
        // 全局亮度
        this.globalBrightness = 100;
        
        // 全景设置
        this.panoramaMode = 'off';
        this.panoramaRotation = { x: 0, y: 0 };
        this.isPanoramaDragging = false;
        this.isFileDialogOpen = false;
        this.isTranscoding = false;
        this.isLoadingVideo = false;
        this.panoramaLastPos = { x: 0, y: 0 };
        this.panoramaCanvas = null;
        this.panoramaCtx = null;
        this.panoramaAnimationId = null;
        
        // WebGL相关
        this.panoramaGL = null;
        this.panoramaProgram = null;
        this.panoramaTexture = null;
        this.panoramaPositionBuffer = null;
        this.useWebGL = true;
        
        // 全屏控制
        this.fullscreenControlTimer = null;
        this.isFullscreen = false;
        
        // 音频控制
        this.audioContext = null;
        this.audioSource = null;
        this.audioSplitter = null;
        this.audioMerger = null;
        this.audioGainLeft = null;
        this.audioGainRight = null;
        this.currentAudioChannel = 'default';
        this.audioSyncDelay = 0;
        this.externalAudios = [];
        this.currentExternalAudio = null;
        
        // 左眼 / 环绕声 / 3D 状态（独立于其他功能，默认关闭）
        this.leftEyeOn = false;
        this.leftEyeViewAngle = 0;
        this.leftEyeBrightness = 100;
        this.leftEyeContrast = 100;
        this.surroundOn = false;
        this.surroundMode = 'off';
        this.surroundIntensity = 50;
        this.surroundBass = 0;
        this.surroundDelayL = null;
        this.surroundDelayR = null;
        this.surroundGainLtoR = null;
        this.surroundGainRtoL = null;
        this.surroundBassFilter = null;
        this.threeDOn = false;
        this.threeDMode = 'off';
        this.threeDDepth = 50;
        this.eyeDistance = 0;
        this.threeDCanvas = null;
        this.threeDCtx = null;
        this.threeDAnimationId = null;
        
        // 初始化 DOM 元素 (必须最先调用)
        this.initElements();

        // 初始化 UI / 引擎 / 鉴权（任一步失败也继续，确保至少能绑定点击）
        try {
            this.ui.init();
            this.engine.init(document.getElementById('videoPlayer'));
            this.auth.init();
        } catch (e) {
            console.warn('鲲穹影音: UI/引擎/鉴权初始化异常，继续绑定事件', e);
        }

        // 事件绑定必须执行，否则界面点击无反应
        try {
            this.initEventListeners();
        } catch (e) {
            console.error('鲲穹影音: initEventListeners 失败，界面将无法点击', e);
            if (typeof alert === 'function') alert('事件初始化失败: ' + (e && e.message ? e.message : String(e)));
        }

        this.loadSettings();
        this.loadSavedPlayerSettings();
        this.loadHotkeys();
        this.loadPlaybackSettings();
        this.initDlna();
        this.initOpenFileListener();
    }

    /**
     * 初始化监听来自主进程的文件打开请求
     * 功能：实现双击视频文件自动播放
     * 作者：FullStack-Guardian
     * 更新时间：2026-02-02
     */
    initOpenFileListener() {
        if (window.electronAPI && window.electronAPI.onOpenFile) {
            window.electronAPI.onOpenFile((filePath) => {
                console.log('接收到外部打开文件请求:', filePath);
                this.addFileToPlaylist(filePath, true);
            });
        }
    }

    /**
     * 将单个文件添加到播放列表并可选立即播放
     * @param {string} filePath 文件绝对路径
     * @param {boolean} shouldPlay 是否立即播放
     */
    async addFileToPlaylist(filePath, shouldPlay = false) {
        const fileName = filePath.split(/[\\\/]/).pop();
        const fileExt = fileName.split('.').pop().toLowerCase();
        
        // 检查是否已在播放列表中
        const existingIndex = this.playlist.findIndex(item => item.filePath === filePath);
        
        if (existingIndex !== -1) {
            if (shouldPlay) {
                this.loadVideo(existingIndex);
            }
            return;
        }

        // 获取文件大小
        let fileSize = 0;
        if (window.electronAPI && window.electronAPI.getFileSize) {
            fileSize = await window.electronAPI.getFileSize(filePath);
        }

        // 添加到播放列表
        const newItem = {
            name: fileName,
            url: `file:///${filePath.replace(/\\/g, '/')}`,
            filePath: filePath,
            size: fileSize,
            type: 'video/' + fileExt
        };

        this.playlist.push(newItem);
        this.updatePlaylistUI();

        if (shouldPlay) {
            this.loadVideo(this.playlist.length - 1);
        }
    }


    initElements() {
        // 视频元素
        this.video = document.getElementById('videoPlayer');
        this.videoArea = document.querySelector('.video-area');
        this.welcomeScreen = document.getElementById('welcomeScreen');
        this.loadingOverlay = document.getElementById('loadingOverlay');
        this.playPauseOverlay = document.getElementById('playPauseOverlay');
        this.videoInfoOverlay = document.getElementById('videoInfoOverlay');
        this.videoTitle = document.getElementById('videoTitle');
        
        // 控制按钮
        this.playBtn = document.getElementById('playBtn');
        this.playPauseBig = document.getElementById('playPauseBig');
        this.stopBtn = document.getElementById('stopBtn');
        this.prevBtn = document.getElementById('prevBtn');
        this.nextBtn = document.getElementById('nextBtn');
        this.volumeBtn = document.getElementById('volumeBtn');
        this.volumeSlider = document.getElementById('volumeSlider');
        this.speedBtn = document.getElementById('speedBtn');
        this.speedMenu = document.getElementById('speedMenu');
        this.playlistBtn = document.getElementById('playlistBtn');
        this.fullscreenBtn = document.getElementById('fullscreenBtn');
        this.screenshotBtn = document.getElementById('screenshotBtn');
        this.pipBtn = document.getElementById('pipBtn');
        this.castBtn = document.getElementById('castBtn');
        
        // 进度条
        this.progressBarContainer = document.getElementById('progressBarContainer');
        this.progressPlayed = document.getElementById('progressPlayed');
        this.progressBuffered = document.getElementById('progressBuffered');
        this.progressThumb = document.getElementById('progressThumb');
        
        // 时间显示
        this.currentTime = document.getElementById('currentTime');
        this.totalTime = document.getElementById('totalTime');
        
        // 播放列表
        this.playlistPanel = document.getElementById('playlistPanel');
        this.playlistContent = document.getElementById('playlistContent');
        this.closePlaylist = document.getElementById('closePlaylist');
        this.addFiles = document.getElementById('addFiles');
        this.clearPlaylistBtn = document.getElementById('clearPlaylist');
        this.playModeBtn = document.getElementById('playModeBtn');
        
        // 文件输入
        this.fileInput = document.getElementById('fileInput');
        
        // 右键菜单
        this.contextMenu = document.getElementById('contextMenu');
        
        // 菜单项
        this.openUrlMenu = document.getElementById('openUrl');
        this.openFolderMenu = document.getElementById('openFolder');
        this.openFileMenu = document.getElementById('openFile');
        this.playPauseMenu = document.getElementById('playPauseMenu');
        this.stopMenu = document.getElementById('stopMenu');
        this.nextMenu = document.getElementById('nextMenu');
        this.prevMenu = document.getElementById('prevMenu');
        this.fastForwardMenu = document.getElementById('fastForwardMenu');
        this.rewindMenu = document.getElementById('rewindMenu');

        // URL对话框
        this.urlDialog = document.getElementById('urlDialog');
        this.urlInput = document.getElementById('urlInput');
        
        // 欢迎界面按钮
        this.openFileBtn = document.getElementById('openFileBtn');
        
        // 窗口控制
        this.minBtn = document.getElementById('minBtn');
        this.maxBtn = document.getElementById('maxBtn');
        this.closeBtn = document.getElementById('closeBtn');
        
        // 帮助菜单项 / 定制软件按钮
        this.customSoftware = document.getElementById('customSoftwareTitleBtn') || document.getElementById('customSoftware');
        this.checkUpdateMenu = document.getElementById('checkUpdateMenu');
        this.feedbackMenu = document.getElementById('feedbackMenu');
        this.helpDocMenu = document.getElementById('helpDocMenu');
        this.shortcutsMenu = document.getElementById('shortcutsMenu');
        this.exitMenu = document.getElementById('exitMenu');
        
        // 画质调节
        this.pictureQualityBtn = document.getElementById('pictureQualityBtn') || this.createHiddenButton('pictureQualityBtn');
        this.pictureQualityPanel = document.getElementById('pictureQualityPanel');
        this.closePictureQuality = document.getElementById('closePictureQuality');
        this.brightnessSlider = document.getElementById('brightness');
        this.contrastSlider = document.getElementById('contrast');
        this.saturationSlider = document.getElementById('saturation');
        this.hueSlider = document.getElementById('hue');
        
        // 音频调节
        this.audioAdjustBtn = document.getElementById('audioAdjustBtn') || this.createHiddenButton('audioAdjustBtn');
        this.audioAdjustPanel = document.getElementById('audioAdjustPanel');
        this.closeAudioAdjust = document.getElementById('closeAudioAdjust');
        
        // 全局亮度调节
        this.globalBrightnessBtn = document.getElementById('globalBrightnessBtn') || this.createHiddenButton('globalBrightnessBtn');
        this.brightnessPanel = document.getElementById('brightnessPanel');
        this.globalBrightnessSlider = document.getElementById('globalBrightnessSlider');
        this.brightnessValue = document.getElementById('brightnessValue');
        this.closeBrightness = document.getElementById('closeBrightness');
        this.resetGlobalBrightness = document.getElementById('resetGlobalBrightness');
        
        // 控制面板
        this.controlMenuBtn = document.getElementById('controlMenuBtn');
        this.controlPanel = document.getElementById('controlPanel');
        this.closeControlPanel = document.getElementById('closeControlPanel');
        
        // 字幕面板
        this.subtitleMenuBtn = document.getElementById('subtitleMenuBtn');
        this.closeSubtitlePanel = document.getElementById('closeSubtitlePanel');
        
        // 左眼设置
        this.leftEyePanel = document.getElementById('leftEyePanel');
        this.closeLeftEye = document.getElementById('closeLeftEye');
        
        // 环绕声设置
        this.surroundSoundPanel = document.getElementById('surroundSoundPanel');
        this.closeSurroundSound = document.getElementById('closeSurroundSound');
        
        // 3D设置
        this.threeDPanel = document.getElementById('threeDPanel');
        this.closeThreeD = document.getElementById('closeThreeD');
        
        // 字幕设置
        this.subtitleSettingsPanel = document.getElementById('subtitleSettingsPanel');
        this.closeSubtitlePanel = document.getElementById('closeSubtitlePanel');
        this.subtitleFiles = []; // 主字幕文件列表
        this.secondarySubtitleFiles = []; // 次字幕文件列表
        this.currentSubtitle = null;
        this.currentSecondarySubtitle = null;
        this.subtitleDelay = 0;
        this.secondarySubtitleDelay = 0;
        this.currentSubtitleTab = 'main'; // 当前字幕标签页: 'main' 或 'secondary'
        this.mainSubtitleTrack = null;
        this.secondarySubtitleTrack = null;
        this.subtitleSelect = null;
        this.secondarySubtitleEnabled = false;
        
        // 主字幕样式
        this.mainSubtitleStyle = {
            fontFamily: 'Microsoft YaHei',
            fontSize: '25px',
            color: '#FFFFFF',
            backgroundColor: 'transparent',
            position: { x: 0, y: 0 }
        };
        
        // 次字幕样式
        this.secondarySubtitleStyle = {
            fontFamily: 'Microsoft YaHei',
            fontSize: '25px',
            color: '#FFFFFF',
            backgroundColor: 'transparent',
            position: { x: 0, y: 0 }
        };
        
        // 创建动态样式表用于字幕样式
        this.subtitleStyleSheet = null;
        
        // 关灯模式
        this.lightsOffOverlay = document.getElementById('lightsOffOverlay');
        this.isLightsOff = false;
        
        // 截图预览
        this.screenshotPreview = document.getElementById('screenshotPreview');
        this.screenshotPreviewImage = document.getElementById('screenshotPreviewImage');
        this.closeScreenshotPreview = document.getElementById('closeScreenshotPreview');
        this.cancelScreenshot = document.getElementById('cancelScreenshot');
        this.confirmScreenshot = document.getElementById('confirmScreenshot');
        this.screenshotBlob = null;
        
        // 视频属性
        this.videoProperties = document.getElementById('videoProperties');
        this.closeProperties = document.getElementById('closeProperties');
        this.confirmProperties = document.getElementById('confirmProperties');
        this.propertiesFilename = document.getElementById('propertiesFilename');
        this.propertiesType = document.getElementById('propertiesType');
        this.propertiesResolution = document.getElementById('propertiesResolution');
        this.propertiesDuration = document.getElementById('propertiesDuration');
        this.propertiesFramerate = document.getElementById('propertiesFramerate');
        this.propertiesSize = document.getElementById('propertiesSize');
        this.propertiesLocation = document.getElementById('propertiesLocation');
        this.propertiesCodec = document.getElementById('propertiesCodec');
        this.propertiesBitrate = document.getElementById('propertiesBitrate');
        this.propertiesDetails = document.getElementById('propertiesDetails');
        this.btnMoreInfo = document.getElementById('btnMoreInfo');
        
        // DLNA投屏
        this.dlnaDialog = document.getElementById('dlnaDialog');
        this.closeDlna = document.getElementById('closeDlna');
        this.dlnaDeviceList = document.getElementById('dlnaDeviceList');
        this.dlnaRefresh = document.getElementById('dlnaRefresh');
        this.dlnaConnect = document.getElementById('dlnaConnect');
        this.dlnaHelp = document.getElementById('dlnaHelp');
        this.dlnaDevices = []; // 存储检测到的DLNA设备
        
        // 截图路径提示
        this.screenshotPathNotification = document.getElementById('screenshotPathNotification');
        this.screenshotPathLink = document.getElementById('screenshotPathLink');
        this.screenshotPathTimer = null; // 用于自动隐藏提示的定时器
        
        // 通用消息通知
        this.messageNotification = document.getElementById('messageNotification');
        this.notificationText = document.getElementById('notificationText');
        this.notificationTimer = null;
        
        // 字幕轨道元素
        this.mainSubtitleTrack = document.getElementById('mainSubtitleTrack');
        this.secondarySubtitleTrack = document.getElementById('secondarySubtitleTrack');
        this.subtitleSelect = document.getElementById('subtitleSelect');
        
        // 自定义对话框元素
        this.customDialog = document.getElementById('customDialog');
        this.customDialogMessage = document.getElementById('customDialogMessage');
        this.customDialogIcon = document.getElementById('customDialogIcon');
        this.customDialogConfirm = document.getElementById('customDialogConfirm');
        this.customDialogCancel = document.getElementById('customDialogCancel');
        this.dialogResolve = null; // 用于Promise解析

        // 初始化登录 UI
        this.initLoginUI();
    }
    
    /**
     * 初始化登录相关 UI 交互
     */
    initLoginUI() {
        const userBtn = document.getElementById('userBtn');
        const userPanel = document.getElementById('userPanel');
        const loginActionBtn = document.getElementById('loginActionBtn');
        const logoutBtn = document.getElementById('logoutBtn');
        const userAvatar = document.getElementById('userAvatar');
        const userNickname = document.getElementById('userNickname');
        const panelAvatar = document.getElementById('panelAvatar');
        const panelNickname = document.getElementById('panelNickname');
        const panelStatus = document.getElementById('panelStatus');
        const tokenSection = document.getElementById('tokenSection');
        const tokenValue = document.getElementById('tokenValue');

        if (!userBtn) return;

        // 切换面板显示
        userBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            userPanel.classList.toggle('active');
        });

        // 点击外部关闭面板
        document.addEventListener('click', () => {
            userPanel.classList.remove('active');
        });

        userPanel.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // 登录动作
        loginActionBtn.addEventListener('click', async () => {
            try {
                this.clearLoginError();
                loginActionBtn.disabled = true;
                loginActionBtn.innerText = i18n.t('app.redirecting');
                await window.loginManager.startLoginFlow();
                panelStatus.innerText = i18n.t('app.login_in_browser');
            } catch (error) {
                alert('启动登录失败: ' + error.message);
                loginActionBtn.disabled = false;
                loginActionBtn.innerText = i18n.t('app.login_action');
            }
        });

        // 退出登录
        logoutBtn.addEventListener('click', async () => {
            if (await this.showConfirm(i18n.t('dialog.logout_confirm'), 'warning', i18n.t('app.logout'))) {
                window.loginManager.logout();
            }
        });

        // 更新 UI 状态
        const updateUI = () => {
            const isLoggedIn = window.loginManager.isLoggedIn();
            const userInfo = window.loginManager.userInfo;

            if (isLoggedIn && userInfo) {
                // 已登录状态
                userAvatar.src = userInfo.avatar || 'icon.ico';
                userNickname.innerText = userInfo.nickname || i18n.t('app.logged_in');
                panelAvatar.src = userInfo.avatar || 'icon.ico';
                panelNickname.innerText = userInfo.nickname || i18n.t('app.logged_in');
                panelStatus.innerText = i18n.t('app.vip_user');
                
                tokenSection.style.display = 'none';
                
                loginActionBtn.style.display = 'none';
                logoutBtn.style.display = 'block';
            } else {
                // 未登录状态
                userAvatar.src = 'icon.ico';
                userNickname.innerText = i18n.t('app.login');
                panelAvatar.src = 'icon.ico';
                panelNickname.innerText = i18n.t('app.not_logged_in');
                panelStatus.innerText = i18n.t('app.login_tip');
                
                tokenSection.style.display = 'none';
                
                loginActionBtn.style.display = 'block';
                loginActionBtn.disabled = false;
                loginActionBtn.innerText = i18n.t('app.login_action');
                logoutBtn.style.display = 'none';
            }
        };

        // 监听登录/退出成功事件
        window.addEventListener('login-success', (e) => {
            // 实时显示登录成功状态
            const panelStatus = document.getElementById('panelStatus');
            if (panelStatus) {
                panelStatus.classList.remove('error');
                panelStatus.classList.add('success');
                panelStatus.innerHTML = `<i class="fas fa-check-circle"></i> ${i18n.t('app.login_success_sync')}`;
            }
            
            // 延迟一小段时间后刷新 UI，让用户看清“登录成功”
            setTimeout(() => {
                this.clearLoginError();
                updateUI();
            }, 800);
        });
        window.addEventListener('logout-success', updateUI);
        document.addEventListener('languageChanged', () => updateUI());
        
        // 监听登录超时
        window.addEventListener('login-timeout', () => {
            this.showLoginError('登录超时，请重新登录');
        });

        // 监听窗口聚焦事件
        window.addEventListener('focus', () => {
            if (window.loginManager.checkLoginInterrupted(true)) {
                this.showLoginError('您的登录流程已中断，请重新登录');
            }
        });

        // 初始加载
        window.loginManager.init().then(() => {
            updateUI();
            if (window.loginManager.checkLoginInterrupted()) {
                this.showLoginError('您的登录流程已中断，请重新登录');
            }
        });
    }

    /**
     * 显示登录错误状态
     */
    showLoginError(message) {
        const userPanel = document.getElementById('userPanel');
        const panelStatus = document.getElementById('panelStatus');
        const loginActionBtn = document.getElementById('loginActionBtn');

        userPanel.classList.add('error-state');
        panelStatus.classList.add('error');
        panelStatus.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;
        
        loginActionBtn.disabled = false;
        loginActionBtn.innerText = i18n.t('app.relogin');
        loginActionBtn.style.display = 'block';

        // 如果面板没打开，自动打开它以显示错误
        userPanel.classList.add('active');
    }

    /**
     * 清除登录错误状态
     */
    clearLoginError() {
        const userPanel = document.getElementById('userPanel');
        const panelStatus = document.getElementById('panelStatus');
        
        userPanel.classList.remove('error-state');
        panelStatus.classList.remove('error');
    }
    
    createHiddenButton(id) {
        // 创建隐藏按钮元素以维持功能逻辑
        const btn = document.createElement('button');
        btn.id = id;
        btn.style.display = 'none';
        document.body.appendChild(btn);
        return btn;
    }

    // ========== 自定义对话框方法 ==========
    /**
     * 显示自定义alert对话框
     * @param {string} message - 显示的消息
     * @param {string} type - 类型: 'info', 'warning', 'error', 'success'
     * @param {string} title - 标题，默认为'提示'
     */
    async showAlert(message, type = 'info', title = '提示') {
        return new Promise((resolve) => {
            this.dialogResolve = resolve;
            
            // 设置消息
            this.customDialogMessage.textContent = message;
            
            // 设置图标类型
            this.customDialogIcon.className = `fas ${this.getDialogIcon(type)}`;
            this.customDialogIcon.parentElement.className = `custom-dialog-icon ${type}`;
            
            // 隐藏取消按钮，alert只有确定按钮
            this.customDialogCancel.style.display = 'none';
            this.customDialogConfirm.style.display = 'block';
            
            // 显示对话框
            this.customDialog.style.display = 'flex';
            
            // 绑定事件
            const handleConfirm = () => {
                this.hideDialog();
                resolve(true);
            };
            
            // 移除旧的事件监听器
            this.customDialogConfirm.replaceWith(this.customDialogConfirm.cloneNode(true));
            
            // 重新获取元素引用
            this.customDialogConfirm = document.getElementById('customDialogConfirm');
            
            // 添加新的事件监听器
            this.customDialogConfirm.addEventListener('click', handleConfirm);
        });
    }
    
    /**
     * 显示自定义confirm对话框
     * @param {string} message - 显示的消息
     * @param {string} type - 类型: 'info', 'warning', 'error', 'success'
     * @param {string} title - 标题，默认为'确认'
     * @returns {Promise<boolean>} - true表示确认，false表示取消
     */
    async showConfirm(message, type = 'warning', title = '确认') {
        return new Promise((resolve) => {
            this.dialogResolve = resolve;
            
            // 设置消息
            this.customDialogMessage.textContent = message;
            
            // 设置图标类型
            this.customDialogIcon.className = `fas ${this.getDialogIcon(type)}`;
            this.customDialogIcon.parentElement.className = `custom-dialog-icon ${type}`;
            
            // 显示取消和确定按钮
            this.customDialogCancel.style.display = 'block';
            this.customDialogConfirm.style.display = 'block';
            
            // 显示对话框
            this.customDialog.style.display = 'flex';
            
            // 绑定事件
            const handleConfirm = () => {
                this.hideDialog();
                resolve(true);
            };
            
            const handleCancel = () => {
                this.hideDialog();
                resolve(false);
            };
            
            // 移除旧的事件监听器
            this.customDialogConfirm.replaceWith(this.customDialogConfirm.cloneNode(true));
            this.customDialogCancel.replaceWith(this.customDialogCancel.cloneNode(true));
            
            // 重新获取元素引用
            this.customDialogConfirm = document.getElementById('customDialogConfirm');
            this.customDialogCancel = document.getElementById('customDialogCancel');
            
            // 添加新的事件监听器
            this.customDialogConfirm.addEventListener('click', handleConfirm);
            this.customDialogCancel.addEventListener('click', handleCancel);
        });
    }
    
    /**
     * 隐藏对话框
     */
    hideDialog() {
        this.customDialog.style.display = 'none';
    }
    
    /**
     * 根据类型获取对应的图标
     */
    getDialogIcon(type) {
        const iconMap = {
            'info': 'fa-info-circle',
            'warning': 'fa-exclamation-triangle',
            'error': 'fa-times-circle',
            'success': 'fa-check-circle'
        };
        return iconMap[type] || 'fa-info-circle';
    }

    initEventListeners() {
        // 窗口大小调整时更新视频尺寸（用于比例控制）
        window.addEventListener('resize', () => {
            this.updateVideoSize();
        });
        window.addEventListener('beforeunload', () => {
            const item = this.playlist[this.currentIndex];
            if (item && this.video && this.video.src && !isNaN(this.video.duration) && this.video.duration > 0) {
                const key = this.getResumeKey(item);
                if (key) this.savePlaybackPosition(key, this.video.currentTime, this.video.duration);
            }
        });

        // 视频事件（无 video 元素时不绑定，避免整段初始化抛错导致所有点击失效）
        if (this.video) {
            this.video.addEventListener('loadedmetadata', () => this.onVideoLoaded());
            this.video.addEventListener('timeupdate', () => this.onTimeUpdate());
            this.video.addEventListener('progress', () => this.onProgress());
            this.video.addEventListener('play', () => this.onPlay());
            this.video.addEventListener('pause', () => this.onPause());
            this.video.addEventListener('ended', () => this.onEnded());
            this.video.addEventListener('waiting', () => this.showLoading());
            this.video.addEventListener('canplay', () => {
                if (this.isTranscoding) {
                    console.log('正在解码中，忽略全局 canplay 事件');
                    return;
                }
                this.hideLoading();
            });
            this.video.addEventListener('canplaythrough', () => {
                if (this.isTranscoding) {
                    console.log('正在解码中，忽略全局 canplaythrough 事件');
                    return;
                }
                this.hideLoading();
            });
            this.video.addEventListener('error', (e) => this.onVideoError(e));
            this.video.addEventListener('click', () => this.togglePlay());
            this.video.addEventListener('dblclick', (e) => {
                if (e.target === this.video) {
                    e.stopPropagation();
                    this.toggleFullscreen();
                }
            });
        }

        // 播放控制（使用可选链，缺元素时不抛错）
        this.playBtn?.addEventListener('click', () => this.togglePlay());
        this.playPauseBig?.addEventListener('click', () => this.togglePlay());
        this.stopBtn?.addEventListener('click', () => this.stop());
        this.prevBtn?.addEventListener('click', () => this.playPrevious());
        this.nextBtn?.addEventListener('click', () => this.playNext());

        if (this.progressBarContainer) {
            this.progressBarContainer.addEventListener('click', (e) => this.seek(e));
            this.progressBarContainer.addEventListener('mousedown', (e) => this.startDragging(e));
        }
        this.volumeBtn?.addEventListener('click', () => this.toggleMute());
        this.volumeSlider?.addEventListener('input', (e) => this.setVolume(e.target.value));

        if (this.speedBtn) {
            this.speedBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.speedMenu?.classList.toggle('active');
            });
        }
        document.querySelectorAll('.speed-option').forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                this.setSpeed(parseFloat(e.target.dataset.speed));
            });
        });

        this.playlistBtn?.addEventListener('click', () => this.togglePlaylist());
        this.closePlaylist?.addEventListener('click', () => this.togglePlaylist());
        this.addFiles?.addEventListener('click', () => this.openFileDialog());
        this.clearPlaylistBtn?.addEventListener('click', () => this.clearPlaylist());
        this.playModeBtn?.addEventListener('click', () => this.togglePlayMode());

        this.fullscreenBtn?.addEventListener('click', () => this.toggleFullscreen());
        document.addEventListener('fullscreenchange', () => this.handleFullscreenChange());
        document.addEventListener('mousemove', (e) => this.handleFullscreenMouseMove(e));

        this.screenshotBtn?.addEventListener('click', () => this.showScreenshotPreview());
        this.castBtn?.addEventListener('click', () => this.showDlnaDialog());
        
        // 菜单项事件：文件/播放/快进快退等由 bindMenuOptions 按 id 统一分发，此处不再重复绑定

        // 初始化 URL 对话框事件
        this.initUrlDialogEvents();
        
        // 截图预览对话框
        this.closeScreenshotPreview?.addEventListener('click', () => this.hideScreenshotPreview());
        this.cancelScreenshot?.addEventListener('click', () => this.hideScreenshotPreview());
        this.confirmScreenshot?.addEventListener('click', () => this.saveScreenshot());
        
        // 截图"不再弹出"复选框
        const screenshotNoPopupCheckbox = document.getElementById('screenshotNoPopup');
        if (screenshotNoPopupCheckbox) {
            // 初始化复选框状态（每次启动都是未勾选）
            screenshotNoPopupCheckbox.checked = false;
            
            // 监听复选框变化（只保存在内存中，不持久化）
            screenshotNoPopupCheckbox.addEventListener('change', (e) => {
                this.screenshotNoPopup = e.target.checked;
                console.log('截图不再弹出设置:', this.screenshotNoPopup ? '开启' : '关闭');
            });
        }
        
        // 点击遮罩层关闭截图预览
        const screenshotOverlay = document.querySelector('.screenshot-preview-overlay');
        if (screenshotOverlay) {
            screenshotOverlay.addEventListener('click', () => this.hideScreenshotPreview());
        }
        
        // 帮助菜单 - 关于（按 id 绑定，内容随当前语言）
        const aboutApp = document.getElementById('aboutApp');
        if (aboutApp) {
            aboutApp.addEventListener('click', () => {
                this.showAlert(i18n.t('dialog.about_content'), 'info', i18n.t('menu.about'));
            });
        }
        
        // 定制软件
        if (this.customSoftware) {
            this.customSoftware.addEventListener('click', () => this.handleCustomSoftware());
        }

        // 检查更新
        if (this.checkUpdateMenu) {
            this.checkUpdateMenu.addEventListener('click', () => this.checkForUpdates());
        }

        // 反馈问题（按 id 绑定，与语言无关，避免英文下“Feedback”无法触发）
        if (this.feedbackMenu) {
            this.feedbackMenu.addEventListener('click', () => {
                window.open('https://www.kunqiongai.com/feedback?soft_number=10019', '_blank');
            });
        }

        // 帮助文档（按 id 绑定，内容随当前语言）
        if (this.helpDocMenu) {
            this.helpDocMenu.addEventListener('click', () => {
                this.showAlert(i18n.t('dialog.help_doc_content'), 'info', i18n.t('menu.help_doc'));
            });
        }

        // 快捷键说明（按 id 绑定，内容随当前语言）
        if (this.shortcutsMenu) {
            this.shortcutsMenu.addEventListener('click', () => {
                this.showAlert(i18n.t('dialog.shortcuts_content'), 'info', i18n.t('menu.shortcuts'));
            });
        }
        // 第三方许可
        const licensesMenu = document.getElementById('licensesMenu');
        if (licensesMenu) {
            licensesMenu.addEventListener('click', () => {
                this.showAlert(i18n.t('dialog.licenses_content'), 'info', i18n.t('menu.licenses'));
            });
        }
        // 隐私说明
        const privacyMenu = document.getElementById('privacyMenu');
        if (privacyMenu) {
            privacyMenu.addEventListener('click', () => {
                this.showAlert(i18n.t('dialog.privacy_content'), 'info', i18n.t('menu.privacy'));
            });
        }

        // 退出（按 id 绑定，确认文案随当前语言）
        if (this.exitMenu) {
            this.exitMenu.addEventListener('click', async () => {
                const confirmed = await this.showConfirm(i18n.t('dialog.close_confirm'), 'warning', i18n.t('dialog.close_title'));
                if (confirmed) window.close();
            });
        }

        // 初始化更新监听
        this.initUpdateListeners();
        
        // 视频属性对话框
        this.closeProperties?.addEventListener('click', () => this.hideVideoProperties());
        this.confirmProperties?.addEventListener('click', () => this.hideVideoProperties());
        
        // 更多信息按钮
        if (this.btnMoreInfo) {
            this.btnMoreInfo.addEventListener('click', () => this.toggleMoreInfo());
        }
        
        // 点击遮罩层关闭属性对话框
        const propertiesOverlay = document.querySelector('.properties-overlay');
        if (propertiesOverlay) {
            propertiesOverlay.addEventListener('click', () => this.hideVideoProperties());
        }
        
        // 文件选择
        this.fileInput?.addEventListener('change', (e) => this.handleFileSelect(e));
        this.openFileBtn?.addEventListener('click', () => this.openFileDialog());
        
        // 绑定所有菜单选项
        this.bindMenuOptions();
        
        // 拖放
        if (this.videoArea) {
            this.videoArea.addEventListener('dragover', (e) => this.onDragOver(e));
            this.videoArea.addEventListener('dragleave', (e) => this.onDragLeave(e));
            this.videoArea.addEventListener('drop', (e) => this.onDrop(e));
        }
        if (this.playlistPanel) {
            this.playlistPanel.addEventListener('dragover', (e) => this.onDragOver(e));
            this.playlistPanel.addEventListener('drop', (e) => this.onDrop(e));
        }
        
        // 右键菜单
        this.videoArea?.addEventListener('contextmenu', (e) => this.showContextMenu(e));
        document.addEventListener('click', () => this.hideContextMenu());
        
        // 右键菜单项
        document.querySelectorAll('.context-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleContextAction(item.dataset.action, e);
            });
        });

        // 画中画模块初始化
        this.initPip?.();
        this.pipBtn?.addEventListener('click', () => this.togglePip?.());

        // A-B 段循环模块初始化
        this.initABLoop?.();

        // 收藏模块初始化
        this.initFavorites?.();

        // 最近播放模块初始化
        this.initRecent?.();

        // 启动时若有上次未播放完的视频，弹窗询问是否续播
        setTimeout(() => this.checkResumeOnStartup?.(), 500);
        
        // 语言切换时刷新播放模式按钮、播放列表空状态、收藏与最近播放列表等依赖 i18n 的 UI
        document.addEventListener('languageChanged', () => {
            this.updatePlayModeButton();
            this.updatePlaylistUI();
            this.renderFavoritesUI?.();
            this.renderRecentUI?.();
        });
        
        // 键盘快捷键 - 使用捕获阶段确保不被拦截
        document.addEventListener('keydown', (e) => this.handleKeyboard(e), true);
        
        // 点击其他地方关闭速度菜单
        document.addEventListener('click', (e) => {
            if (!this.speedBtn.contains(e.target)) {
                this.speedMenu.classList.remove('active');
            }
        });
        
        // 窗口控制
        this.minBtn?.addEventListener('click', () => {
            if (window.electronAPI && window.electronAPI.minimizeWindow) {
                window.electronAPI.minimizeWindow();
            }
        });
        this.maxBtn?.addEventListener('click', () => {
            if (window.electronAPI && window.electronAPI.toggleMaximizeWindow) {
                window.electronAPI.toggleMaximizeWindow();
            }
        });
        
        // 监听窗口最大化状态变化，更新按钮图标
        if (window.electronAPI && window.electronAPI.onWindowMaximize && this.maxBtn) {
            window.electronAPI.onWindowMaximize((isMaximized) => {
                const maxBtnIcon = this.maxBtn.querySelector('i');
                if (maxBtnIcon) {
                    if (isMaximized) {
                        maxBtnIcon.className = 'fas fa-window-restore';
                        this.maxBtn.title = '还原';
                    } else {
                        maxBtnIcon.className = 'fas fa-window-maximize';
                        this.maxBtn.title = '最大化';
                    }
                }
            });
        }
        
        this.closeBtn?.addEventListener('click', async () => {
            const confirmed = await this.showConfirm(i18n.t('dialog.close_confirm'), 'warning', i18n.t('dialog.close_title'));
            if (confirmed) {
                if (window.electronAPI && window.electronAPI.closeWindow) {
                    window.electronAPI.closeWindow();
                } else {
                    window.close();
                }
            }
        });
        
        // 画质调节
        this.initPictureQuality();
        
        // 音频调节
        this.initAudioAdjust();
        
        // 全局亮度调节
        this.initGlobalBrightness();
        
        // 控制面板
        this.initControlPanel();
        
        // 播放菜单选项
        this.initPlaybackMenu();
        
        // 菜单交互增强
        this.initMenuInteraction();
        
        // 左眼设置（保留详细设置面板）
        this.initLeftEyePanel();
        
        // 环绕声设置（保留详细设置面板）
        this.initSurroundSoundPanel();
        
        // 3D设置（保留详细设置面板）
        this.initThreeDPanel();
        
        // 字幕设置
        this.initSubtitleSettings();
        
        // 关灯模式
        this.initLightsOff();
        
        // 文件关联
        this.initFileAssociation();
        
        // 菜单栏画质调节按钮
        const pictureQualityMenuBtn = document.getElementById('pictureQualityMenuBtn');
        if (pictureQualityMenuBtn) {
            pictureQualityMenuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isActive = this.pictureQualityPanel.classList.toggle('active');
                
                // 同步按钮状态
                if (isActive) {
                    pictureQualityMenuBtn.classList.add('active');
                    this.pictureQualityBtn.classList.add('active');
                    // 关闭音频面板
                    this.audioAdjustPanel.classList.remove('active');
                    this.audioAdjustBtn.classList.remove('active');
                    const audioMenuBtn = document.getElementById('audioAdjustMenuBtn');
                    if (audioMenuBtn) audioMenuBtn.classList.remove('active');
                } else {
                    pictureQualityMenuBtn.classList.remove('active');
                    this.pictureQualityBtn.classList.remove('active');
                }
            });
        }
        
        // 菜单栏音频调节按钮
        const audioAdjustMenuBtn = document.getElementById('audioAdjustMenuBtn');
        if (audioAdjustMenuBtn) {
            audioAdjustMenuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isActive = this.audioAdjustPanel.classList.toggle('active');
                
                // 同步按钮状态
                if (isActive) {
                    audioAdjustMenuBtn.classList.add('active');
                    this.audioAdjustBtn.classList.add('active');
                    // 关闭画质面板
                    this.pictureQualityPanel.classList.remove('active');
                    this.pictureQualityBtn.classList.remove('active');
                    const pictureMenuBtn = document.getElementById('pictureQualityMenuBtn');
                    if (pictureMenuBtn) pictureMenuBtn.classList.remove('active');
                } else {
                    audioAdjustMenuBtn.classList.remove('active');
                    this.audioAdjustBtn.classList.remove('active');
                }
            });
        }
        
        // 菜单栏设置按钮
        const settingsMenuBtn = document.getElementById('settingsMenuBtn');
        if (settingsMenuBtn) {
            settingsMenuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openSettings();
            });
        }
        
        // 初始化设置面板
        this.initSettings();
        
        // 全景功能已移除
        // this.initPanorama();
    }

    /**
     * 处理“我要定制软件”点击
     */
    async handleCustomSoftware() {
        try {
            const response = await fetch('https://api-web.kunqiongai.com/soft_desktop/get_custom_url', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
            
            const result = await response.json();
            
            if (result.code === 1 && result.data && result.data.url) {
                if (window.electronAPI && window.electronAPI.openExternal) {
                    window.electronAPI.openExternal(result.data.url);
                } else {
                    window.open(result.data.url, '_blank');
                }
            } else {
                this.showMessage('获取定制页面链接失败，请稍后重试', 'error');
            }
        } catch (error) {
            console.error('获取定制页面链接出错:', error);
            this.showMessage('网络连接失败，请检查您的网络设置', 'error');
        }
    }

    // ========== 绑定菜单选项 ==========
    // 优先按 id 分发，不依赖文案，任意语言下点击均有效
    bindMenuOptions() {
        const idActions = {
            playPauseMenu: () => this.togglePlay(),
            stopMenu: () => this.stop(),
            nextMenu: () => this.playNext(),
            prevMenu: () => this.playPrevious(),
            fastForwardMenu: () => { if (this.video?.duration) this.video.currentTime = Math.min(this.video.currentTime + this.fastForwardStep, this.video.duration); },
            rewindMenu: () => { if (this.video?.duration) this.video.currentTime = Math.max(this.video.currentTime - this.rewindStep, 0); },
            openFile: () => this.openFileDialog(),
            openFolder: () => this.openFileDialog(true),
            openUrl: () => this.openURL(),
            exitMenu: () => {} // 退出由 initEventListeners 中 #exitMenu 单独绑定
        };

        // 使用事件委托：点击图标/文字时也能可靠触发，避免子节点未绑定
        const menuBar = document.querySelector('.menu-bar');
        if (menuBar) {
            menuBar.addEventListener('click', (e) => {
                const option = e.target.closest('.menu-option');
                if (!option) return;
                if (option.closest('#langListContainer')) return; // 语言项由 i18n 模块处理
                e.stopPropagation();
                const id = option.id;
                const text = option.textContent.trim();

                // 1) 优先按 id 执行（与语言无关）
                if (id && idActions[id]) {
                    idActions[id]();
                }
                // 2) 无 id 或 id 未在表中时，按文案回退（兼容旧结构/子菜单项）
                else if (text.includes('字幕设置') || /subtitle\s*settings|字幕設定/i.test(text)) {
                    this.subtitleSettingsPanel?.classList.toggle('active');
                } else if ((text.includes('设置') || /settings|設定/i.test(text)) && !/字幕|subtitle/i.test(text)) {
                    this.showAlert('设置功能开发中...', 'info', '功能提示');
                } else if (text.includes('画面比例') || /aspect|比例/i.test(text)) {
                    this.showAlert('画面比例调节功能开发中...', 'info', '功能提示');
                } else if (text.includes('画面裁剪') || /crop|裁剪/i.test(text)) {
                    this.showAlert('画面裁剪功能开发中...', 'info', '功能提示');
                } else if (text.includes('收藏') || /favorite|收藏/i.test(text)) {
                    this.switchToFavoritesTab?.();
                } else if (text.includes('左眼模式') || /left\s*eye|左眼/i.test(text)) {
                    this.leftEyePanel?.classList.toggle('active');
                    this.leftEyeBtn?.classList.toggle('active');
                } else if (text.includes('3D模式') || /3D\s*mode|3D/i.test(text)) {
                    this.threeDPanel?.classList.toggle('active');
                    this.threeDBtn?.classList.toggle('active');
                } else if (text.includes('环绕声模式') || /surround|环绕/i.test(text)) {
                    this.surroundSoundPanel?.classList.toggle('active');
                    this.surroundSoundBtn?.classList.toggle('active');
                } else if (text.includes('关灯') || /lights\s*off|关灯/i.test(text)) {
                    this.toggleLightsOff();
                }

                // 关闭所有下拉/子菜单
                document.querySelectorAll('.dropdown-menu').forEach(menu => { menu.style.display = 'none'; });
                document.querySelectorAll('.submenu').forEach(menu => { menu.style.display = 'none'; });
            });
        }
        
        // 菜单项悬停时显示下拉菜单
        const menuItems = document.querySelectorAll('.menu-item');
        menuItems.forEach(item => {
            item.addEventListener('mouseenter', () => {
                // 先关闭其他菜单
                document.querySelectorAll('.dropdown-menu').forEach(menu => {
                    menu.style.display = 'none';
                });
                // 显示当前菜单
                const dropdown = item.querySelector('.dropdown-menu');
                if (dropdown) {
                    dropdown.style.display = 'block';
                }
            });
            
            item.addEventListener('mouseleave', () => {
                const dropdown = item.querySelector('.dropdown-menu');
                if (dropdown) {
                    setTimeout(() => {
                        if (!dropdown.matches(':hover')) {
                            dropdown.style.display = 'none';
                        }
                    }, 100);
                }
            });
        });
        
        // 点击菜单栏外的区域关闭所有菜单
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.menu-bar')) {
                document.querySelectorAll('.dropdown-menu').forEach(menu => {
                    menu.style.display = 'none';
                });
            }
        });
    }

    // ========== 播放控制 ==========
    async togglePlay() {
        if (!await this.auth.ensureAuthorized()) return;
        if (this.video.src) {
            if (this.video.paused) {
                this.video.play();
            } else {
                this.video.pause();
            }
        }
    }

    stop() {
        this.clearABLoop?.();
        this.video.pause();
        this.video.currentTime = 0;
        this.video.removeAttribute('src');
        this.video.load();
        this.welcomeScreen.style.display = 'flex';
        this.currentIndex = -1;
        this.videoTitle.textContent = '';
        this.resetProgressUI();
        this.updatePlaylistUI();
    }

    playNext() {
        if (this.currentIndex < this.playlist.length - 1) {
            this.loadVideo(this.currentIndex + 1);
        }
    }

    playPrevious() {
        if (this.currentIndex > 0) {
            this.loadVideo(this.currentIndex - 1);
        }
    }

    onPlay() {
        this.isPlaying = true;
        this.playBtn.innerHTML = '<i class="fas fa-pause"></i>';
        this.playPauseBig.innerHTML = '<i class="fas fa-pause"></i>';
        
        // 更新左上角信息为当前视频名称
        if (this.playlist[this.currentIndex]) {
            this.showVideoInfo(`正在播放：${this.playlist[this.currentIndex].name}`);
        }
    }

    onPause() {
        this.isPlaying = false;
        this.playBtn.innerHTML = '<i class="fas fa-play"></i>';
        this.playPauseBig.innerHTML = '<i class="fas fa-play"></i>';
    }

    onEnded() {
        console.log(`视频播放结束，当前播放模式: ${this.playMode}`);
        
        switch(this.playMode) {
            case 'loop-list':
                // 列表循环：播放下一个，到最后一个时回到第一个
                if (this.currentIndex < this.playlist.length - 1) {
                    console.log('列表循环: 播放下一个视频');
                    this.playNext();
                } else if (this.playlist.length > 0) {
                    console.log('列表循环: 回到第一个视频');
                    this.loadVideo(0);
                } else {
                    this.stop();
                }
                break;
            
            case 'loop-single':
                // 单曲循环：重新播放当前视频，并恢复倍速
                console.log('单曲循环: 重新播放当前视频');
                if (this.video.playbackRate !== this.playbackRate) {
                    this.video.playbackRate = this.playbackRate;
                    if (this.engine) this.engine.setPlaybackRate(this.playbackRate);
                }
                this.video.currentTime = 0;
                this.video.play();
                break;
            
            case 'random':
                // 随机播放：随机选择一个视频
                if (this.playlist.length > 1) {
                    // 如果有多个视频，避免随机到当前正在播放的视频
                    let randomIndex;
                    do {
                        randomIndex = Math.floor(Math.random() * this.playlist.length);
                    } while (randomIndex === this.currentIndex);
                    console.log(`随机播放: 随机选择视频 #${randomIndex + 1}`);
                    this.loadVideo(randomIndex);
                } else if (this.playlist.length === 1) {
                    // 只有一个视频时重新播放，并恢复倍速
                    console.log('随机播放: 只有一个视频，重新播放');
                    if (this.video.playbackRate !== this.playbackRate) {
                        this.video.playbackRate = this.playbackRate;
                        if (this.engine) this.engine.setPlaybackRate(this.playbackRate);
                    }
                    this.video.currentTime = 0;
                    this.video.play();
                } else {
                    this.stop();
                }
                break;
            
            default:
                this.stop();
        }
    }

    // ========== 视频加载 ==========
    onVideoLoaded() {
        if (this.isTranscoding) {
            console.log('正在解码中，忽略 onVideoLoaded 事件');
            return;
        }
        console.log('视频元数据已加载');
        this.hideLoading();
        this.welcomeScreen.style.display = 'none';
        this.totalTime.textContent = this.formatTime(this.video.duration);
        this.updateVideoInfo();
        
        // 确保应用当前的画面比例设置
        this.updateVideoSize();
    }
    
    onVideoError(e) {
        console.error('视频加载错误事件:', e);
        
        // 确保隐藏loading
        this.hideLoading();
        console.log('视频错误，隐藏loading overlay');
        
        const error = this.video.error;
        let errorMessage = '视频加载失败';
        let errorDetails = '';
        
        if (error) {
            console.error('视频错误代码:', error.code);
            console.error('视频错误信息:', error.message);
            
            switch (error.code) {
                case error.MEDIA_ERR_ABORTED:
                    errorMessage = '视频加载被中止';
                    errorDetails = '用户中止了视频加载';
                    break;
                case error.MEDIA_ERR_NETWORK:
                    errorMessage = '网络错误，无法加载视频';
                    errorDetails = '请检查网络连接和URL是否可访问';
                    break;
                case error.MEDIA_ERR_DECODE:
                    errorMessage = '视频解码失败';
                    errorDetails = '视频文件可能已损坏';
                    break;
                case error.MEDIA_ERR_SRC_NOT_SUPPORTED:
                    errorMessage = '不支持的视频格式或URL无效';
                    errorDetails = '请检查视频格式是否为浏览器支持的格式（MP4/WebM/Ogg）';
                    break;
                default:
                    errorMessage = '未知错误';
                    errorDetails = '错误代码: ' + error.code;
            }
        }
        
        console.error('错误详情:', errorDetails);
        this.showMessage(errorMessage + '，' + errorDetails, 'error');
        
        // 清理事件监听器
        if (this.video._canPlayHandler) {
            this.video.removeEventListener('canplay', this.video._canPlayHandler);
            this.video.removeEventListener('loadedmetadata', this.video._canPlayHandler);
            delete this.video._canPlayHandler;
        }
    }

    /**
     * 验证在线视频 URL 有效性
     * @param {string} url 
     */
    async validateOnlineUrl(url) {
        try {
            // 创建5秒超时控制
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            this.log.info(`正在验证URL有效性: ${url}`);
            
            // 使用 HEAD 请求检查链接
            const response = await fetch(url, { 
                method: 'HEAD', 
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                if (response.status === 404) throw new Error('视频文件不存在 (404)');
                if (response.status === 403) throw new Error('访问被拒绝 (403)');
                if (response.status >= 500) throw new Error(`服务器错误 (${response.status})`);
                throw new Error(`无法访问链接 (${response.status})`);
            }
            
            const type = response.headers.get('content-type');
            if (type && type.includes('text/html')) {
                throw new Error('链接指向的是网页而非视频文件');
            }
            
            this.log.info('URL验证通过');
            return true;
        } catch (e) {
            this.log.warn(`URL验证失败: ${e.message}`);
            if (e.name === 'AbortError') {
                throw new Error('连接超时，请检查网络');
            }
            // 重新抛出以便上层处理
            throw e;
        }
    }

    async loadVideo(index) {
        if (this.isLoadingVideo) {
            console.log('视频正在加载中，忽略重复点击');
            return;
        }
        
        if (!await this.auth.ensureAuthorized()) return;
        if (index < 0 || index >= this.playlist.length) {
            console.error('无效的播放列表索引:', index);
            return;
        }
        
        // 续播：在切换前保存当前正在播放的进度
        const prevIdx = this.currentIndex;
        const prevItem = this.playlist[prevIdx];
        if (prevItem && this.video && this.video.src && !isNaN(this.video.duration) && this.video.duration > 0) {
            const prevKey = this.getResumeKey(prevItem);
            if (prevKey) this.savePlaybackPosition(prevKey, this.video.currentTime, this.video.duration);
        }
        
        try {
            this.isLoadingVideo = true;
            this.currentIndex = index;
            const item = this.playlist[index];
            this.clearABLoop?.();

            this.log.info(`开始加载视频: ${item.name}`);
            this.log.info(`视频URL: ${item.url}`);
            this.log.info(`真实路径: ${item.filePath || '(无)'}`);
            
            console.log('开始加载视频:', item.name);
            console.log('视频URL:', item.url);
            console.log('真实路径:', item.filePath);
            
            // 清除外部音频（切换视频时恢复默认音轨）
            this.clearExternalAudios();
            
            // 停止当前播放
            this.video.pause();
            this.video.currentTime = 0;
            
            // 预判是否需要转码以提供即时反馈（先统一“正在加载”，是否“正在解码”在确认需转码且无缓存后再显示）
            this.showLoading('正在加载...');
            console.log('显示 loading overlay');
            
            // 隐藏欢迎界面
            this.welcomeScreen.style.display = 'none';
            
            // 移除旧的事件监听器（防止重复绑定）
            const oldCanPlayHandler = this.video._canPlayHandler;
            if (oldCanPlayHandler) {
                this.video.removeEventListener('canplay', oldCanPlayHandler);
                this.video.removeEventListener('loadedmetadata', oldCanPlayHandler);
            }
            
            // ========== 真实解码器集成 ==========
            let videoUrl = item.url;
            
            // 如果是绝对路径（Electron 原生对话框选择的文件），需要转换为 file:// 协议
            if (item.filePath && !item.url.startsWith('blob:') && !item.url.startsWith('http')) {
                videoUrl = `file:///${item.filePath.replace(/\\/g, '/')}`;
                item.url = videoUrl; // 更新以供后续使用
            }
            
            // 只对本地文件进行解码器处理（需要有真实文件路径）
            if (item.filePath && !item.url.startsWith('http://') && !item.url.startsWith('https://')) {
                try {
                    // 创建超时Promise工具函数
                    const timeout = (ms, operationName) => new Promise((_, reject) => 
                        setTimeout(() => reject(new Error(`${operationName}超时(${ms/1000}秒)`)), ms)
                    );
                    
                    this.log.info(`使用真实文件路径进行格式检测: ${item.filePath}`);
                    console.log('使用真实文件路径进行格式检测:', item.filePath);
                    
                    // 检查是否需要转码（使用真实文件路径，带5秒超时）
                    const checkResult = await Promise.race([
                        window.electronAPI.checkNeedsTranscode(item.filePath),
                        timeout(5000, '格式检测')
                    ]).catch(err => {
                        this.log.warn(`格式检测失败: ${err.message}`);
                        console.warn('格式检测失败:', err.message);
                        return { success: false, needsTranscode: false };
                    });
                    
                    // 详细记录检测结果
                    this.log.info(`格式检测结果: success=${checkResult.success}, needsTranscode=${checkResult.needsTranscode}`);
                    console.log('格式检测结果:', checkResult);
                    
                    if (checkResult.success && checkResult.needsTranscode) {
                        // 先查解码缓存：再次点击同一视频时直接使用缓存，无需等待解码
                        let cacheResult = null;
                        try {
                            cacheResult = await Promise.race([
                                window.electronAPI.getTranscodeCache(item.filePath),
                                timeout(2000, '查缓存')
                            ]).catch(() => ({ cached: false, outputPath: null }));
                        } catch (e) {
                            cacheResult = { cached: false, outputPath: null };
                        }

                        if (cacheResult && cacheResult.cached && cacheResult.outputPath) {
                            videoUrl = 'file:///' + cacheResult.outputPath.replace(/\\/g, '/');
                            this.log.info(`使用缓存的解码文件: ${videoUrl}`);
                            console.log('使用缓存的解码文件，开始播放');
                        } else {
                            this.isTranscoding = true;
                            this.log.info('视频需要转码，开始转码...');
                            this.showLoading('正在解码...');
                            this.showNotification('检测到特殊格式，正在使用高级解码器处理...', 'info');
                            console.log('视频需要转码，开始转码...');
                            console.log('准备调用transcodeVideo，文件路径:', item.filePath);

                            let transcodeResult = null;

                            try {
                                this.log.info(`准备调用IPC transcode-video: ${item.filePath}`);
                                console.log('调用window.electronAPI.transcodeVideo...');

                                transcodeResult = await Promise.race([
                                    window.electronAPI.transcodeVideo(item.filePath),
                                    timeout(90000, '视频转码')
                                ]).catch(err => {
                                    this.log.error(`转码Promise捕获错误: ${err.message}`);
                                    console.error('转码过程出错:', err.message);
                                    return { success: false, error: err.message };
                                });

                                this.log.info(`转码调用返回结果: ${JSON.stringify(transcodeResult)}`);
                                console.log('转码调用返回:', transcodeResult);
                            } catch (err) {
                                this.log.error(`转码调用异常: ${err.message}`, err);
                                console.error('转码调用异常:', err);
                                transcodeResult = { success: false, error: err.message };
                            } finally {
                                this.isTranscoding = false;
                            }

                            if (transcodeResult && transcodeResult.success) {
                                videoUrl = 'file:///' + transcodeResult.outputPath.replace(/\\/g, '/');
                                this.log.info(`转码成功: ${videoUrl}`);
                                console.log('转码成功，使用转码后的视频:', videoUrl);
                            } else {
                                const errorMsg = transcodeResult ? transcodeResult.error : '未知错误';
                                this.log.error(`转码失败: ${errorMsg}`);
                                console.error('转码失败:', errorMsg);
                                this.showNotification('转码失败，尝试直接播放原视频', 'warning');
                                videoUrl = item.url;
                            }
                        }
                    } else {
                        this.log.info('视频格式无需转码，直接播放');
                        console.log('视频格式无需转码，直接播放');
                    }
                    
                    // 获取视频详细信息（使用真实文件路径，带3秒超时，失败不影响播放）
                    try {
                        const infoResult = await Promise.race([
                            window.electronAPI.getVideoInfo(item.filePath),
                            timeout(3000, '视频信息获取')
                        ]);
                        if (infoResult.success) {
                            console.log('视频信息:', infoResult.info);
                            // 可以在这里显示视频信息给用户
                        }
                    } catch (infoErr) {
                        console.warn('获取视频信息失败:', infoErr.message, '- 继续播放');
                    }
                } catch (error) {
                    console.error('解码器处理失败:', error);
                    this.showNotification(`解码器处理失败: ${error.message}，使用默认播放`, 'warning');
                    // 确保失败后使用原始URL
                    videoUrl = item.url;
                }
            } else if (!item.url.startsWith('http://') && !item.url.startsWith('https://')) {
                console.log('无真实文件路径，跳过解码器处理，直接播放');
            }
            
            // 验证在线视频有效性（快速反馈）
            if (videoUrl.startsWith('http://') || videoUrl.startsWith('https://')) {
                try {
                    this.showLoading('正在验证链接...');
                    await this.validateOnlineUrl(videoUrl);
                } catch (e) {
                    this.hideLoading();
                    // 如果是明确的错误（404或网页），直接抛出阻断流程
                    if (e.message.includes('404') || e.message.includes('网页') || e.message.includes('403')) {
                        throw e;
                    }
                    // 其他网络错误（如CORS或超时），仅记录警告，允许尝试播放（可能只是HEAD被禁或跨域限制）
                    console.warn('验证警告:', e.message, '- 尝试直接播放');
                    this.showVideoInfo('验证未通过，尝试强行播放...');
                }
            }

            // 设置视频源
            try {
                // 对于在线视频，设置crossOrigin属性
                if (videoUrl.startsWith('http://') || videoUrl.startsWith('https://')) {
                    this.video.crossOrigin = 'anonymous';
                    console.log('在线视频，设置crossOrigin');
                }
                
                this.video.src = videoUrl;
                this.video.load();
                console.log('视频开始加载...');
                
                // 设置超时，如果10秒后还在加载，隐藏loading并显示提示
                const loadingTimeout = setTimeout(() => {
                    console.warn('视频加载超时（10秒），隐藏loading');
                    this.hideLoading();
                    
                    if (videoUrl.startsWith('http://') || videoUrl.startsWith('https://')) {
                        this.showMessage('连接超时，请检查 URL 是否正确或网络状态', 'error');
                    } else {
                        this.showMessage('视频加载时间较长，请检查文件是否完整或尝试其他格式', 'warning');
                    }
                }, 10000);
                
                // 当视频可以播放时，清除超时并播放
                const canPlayHandler = () => {
                    if (this.isTranscoding) {
                        console.log('正在解码中，忽略 premature canplay 事件');
                        return;
                    }
                    clearTimeout(loadingTimeout);
                    this.video.removeEventListener('canplay', canPlayHandler);
                    this.video.removeEventListener('loadedmetadata', canPlayHandler);
                    delete this.video._canPlayHandler;
                    
                    console.log('视频可以播放，隐藏loading，开始播放');
                    this.hideLoading();
                    
                    // 续播：仅当本次加载来自「启动时点了续播」才恢复进度；同会话内切换不续播
                    const resumeKey = this.getResumeKey(item);
                    const isStartupResume = this.resumeFromStartupKey != null && resumeKey === this.resumeFromStartupKey;
                    if (isStartupResume) {
                        this.resumeFromStartupKey = null;
                        const savedPos = this.getPlaybackPosition(resumeKey);
                        if (savedPos != null && this.video.duration && savedPos < this.video.duration - 30) {
                            this.video.currentTime = savedPos;
                            const msg = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('dialog.resume_from', { time: this.formatTime(savedPos) }) : `已从 ${this.formatTime(savedPos)} 续播`;
                            this.showNotification(msg, 'info');
                        }
                    } else if (this.resumeFromStartupKey != null) {
                        this.resumeFromStartupKey = null;
                    }
                    
                    // 列表/随机切换视频后恢复当前倍速（新 src 会重置 playbackRate）
                    if (this.video.playbackRate !== this.playbackRate) {
                        this.video.playbackRate = this.playbackRate;
                        if (this.engine) this.engine.setPlaybackRate(this.playbackRate);
                    }
                    
                    // 尝试播放
                    this.video.play()
                        .then(() => {
                            console.log('视频播放成功');
                        })
                        .catch(err => {
                            console.error('播放失败:', err);
                            this.showMessage('视频播放失败: ' + err.message, 'error');
                            // 如果是自动播放被阻止，显示提示
                            if (err.name === 'NotAllowedError') {
                                this.showMessage('请点击播放按钮手动播放视频', 'info');
                            }
                        });
                };
                
                // 保存处理器引用以便清理
                this.video._canPlayHandler = canPlayHandler;
                
                // 监听canplay和loadedmetadata事件
                this.video.addEventListener('canplay', canPlayHandler, { once: true });
                this.video.addEventListener('loadedmetadata', canPlayHandler, { once: true });
                
                // 监听loadstart事件
                this.video.addEventListener('loadstart', () => {
                    console.log('视频开始加载 (loadstart)');
                }, { once: true });
                
                // 监听progress事件
                this.video.addEventListener('progress', () => {
                    console.log('视频加载中 (progress)...');
                }, { once: true });
                
            } catch (error) {
                console.error('设置视频源失败:', error);
                this.hideLoading();
                this.showMessage('视频加载失败: ' + error.message, 'error');
            }
            
            this.videoTitle.textContent = item.name;
            this.updatePlaylistUI();
        } finally {
            this.isLoadingVideo = false;
        }
    }

    updateVideoInfo() {
        const item = this.playlist[this.currentIndex];
        if (item) {
            this.videoTitle.textContent = item.name;
        } else {
            this.videoTitle.textContent = '';
        }
    }

    // ========== 时间和进度 ==========
    onTimeUpdate() {
        if (!this.isDragging) {
            const percent = (this.video.currentTime / this.video.duration) * 100;
            this.progressPlayed.style.width = percent + '%';
            this.progressThumb.style.left = percent + '%';
        }
        this.currentTime.textContent = this.formatTime(this.video.currentTime);
        // 续播：节流保存当前进度
        this.resumeSaveThrottle++;
        if (this.resumeSaveThrottle >= this.RESUME_SAVE_INTERVAL) {
            this.resumeSaveThrottle = 0;
            const item = this.playlist[this.currentIndex];
            if (item && this.video && this.video.duration) {
                const key = this.getResumeKey(item);
                if (key) this.savePlaybackPosition(key, this.video.currentTime, this.video.duration);
            }
        }
    }

    onProgress() {
        if (this.video.buffered.length > 0) {
            const buffered = this.video.buffered.end(this.video.buffered.length - 1);
            const percent = (buffered / this.video.duration) * 100;
            this.progressBuffered.style.width = percent + '%';
        }
    }

    seek(e) {
        if (!this.video.duration) return;
        
        const rect = this.progressBarContainer.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        this.video.currentTime = percent * this.video.duration;
    }

    startDragging(e) {
        if (!this.video.duration) return;
        
        this.isDragging = true;
        const seek = (e) => {
            const rect = this.progressBarContainer.getBoundingClientRect();
            const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            this.video.currentTime = percent * this.video.duration;
            this.progressPlayed.style.width = (percent * 100) + '%';
            this.progressThumb.style.left = (percent * 100) + '%';
        };
        
        const stopDragging = () => {
            this.isDragging = false;
            document.removeEventListener('mousemove', seek);
            document.removeEventListener('mouseup', stopDragging);
        };
        
        document.addEventListener('mousemove', seek);
        document.addEventListener('mouseup', stopDragging);
    }

    formatTime(seconds) {
        if (isNaN(seconds)) return '00:00:00';
        
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    resetProgressUI() {
        if (this.progressPlayed) this.progressPlayed.style.width = '0%';
        if (this.progressThumb) this.progressThumb.style.left = '0%';
        if (this.progressBuffered) this.progressBuffered.style.width = '0%';
        if (this.currentTime) this.currentTime.textContent = '00:00:00';
        if (this.totalTime) this.totalTime.textContent = '00:00:00';
    }

    // ========== 音量控制 ==========
    setVolume(value) {
        this.volume = value;
        this.video.volume = value / 100;
        this.updateVolumeIcon();
        this.saveSettings();
        
        // 同步音频面板的音量滑块
        const audioVolumeSlider = document.getElementById('audioVolumeSlider');
        const audioVolumePercentage = document.getElementById('audioVolumePercentage');
        if (audioVolumeSlider) {
            audioVolumeSlider.value = value;
        }
        if (audioVolumePercentage) {
            audioVolumePercentage.textContent = value + '%';
        }
    }

    toggleMute() {
        if (this.video.volume > 0) {
            this.video.dataset.lastVolume = this.video.volume;
            this.video.volume = 0;
            this.volumeSlider.value = 0;
        } else {
            const lastVolume = this.video.dataset.lastVolume || 1;
            this.video.volume = lastVolume;
            this.volumeSlider.value = lastVolume * 100;
        }
        this.updateVolumeIcon();
    }

    updateVolumeIcon() {
        const volume = this.video.volume * 100;
        let icon = 'fa-volume-up';
        if (volume === 0) {
            icon = 'fa-volume-mute';
        } else if (volume < 50) {
            icon = 'fa-volume-down';
        }
        this.volumeBtn.innerHTML = `<i class="fas ${icon}"></i>`;
    }

    // ========== 播放速度 ==========
    setSpeed(speed) {
        this.playbackRate = speed;
        if (this.engine) {
            this.engine.setPlaybackRate(speed);
        } else {
            this.video.playbackRate = speed;
        }
        
        const speedStr = String(speed);
        const speedText = speedStr + 'x';
        this.speedBtn.querySelector('.speed-text').textContent = speedText;
        
        // 更新菜单项选中状态
        document.querySelectorAll('.speed-option').forEach(opt => {
            opt.classList.remove('active');
            // 通过数值比较来匹配，避免字符串格式不一致问题
            if (parseFloat(opt.dataset.speed) === speed) {
                opt.classList.add('active');
            }
        });
        
        this.speedMenu.classList.remove('active');
        this.saveSettings();
        
        console.log('播放速度已设置为:', speed);
    }

    // ========== 播放列表 ==========
    // ========== 打开文件 ==========
    async openFileDialog(isFolder = false) {
        if (!await this.auth.ensureAuthorized()) return;
        if (this.isFileDialogOpen) {
            console.warn('文件/文件夹选择对话框已打开，忽略重复调用');
            return;
        }
        
        this.isFileDialogOpen = true;
        console.log(`打开${isFolder ? '文件夹' : '文件'}选择对话框`);
        
        try {
            let electronDialogUsed = false;
            
            // 优先使用 Electron 原生对话框（如果可用）
            if (window.electronAPI && window.electronAPI.selectFiles) {
                electronDialogUsed = true;
                try {
                    const options = {
                        title: isFolder ? '选择文件夹' : '选择视频文件',
                        properties: isFolder ? ['openDirectory', 'multiSelections'] : ['openFile', 'multiSelections']
                    };
                    
                    const result = await window.electronAPI.selectFiles(options);
                    
                    if (!result.canceled && result.filePaths.length > 0) {
                        console.log(`用户选择了${isFolder ? '文件夹' : '文件'}:`, result.filePaths);
                        this.addFilePathsToPlaylist(result.filePaths);
                    }
                    
                    // 无论是否取消，只要 Electron 对话框能正常弹出，就不再执行回退方案
                    return;
                } catch (error) {
                    console.error('使用 Electron 对话框失败:', error);
                    electronDialogUsed = false;
                }
            }
            
            // 只有在 Electron 对话框不可用或出错时，才使用回退方案
            if (!electronDialogUsed) {
                // 后备方案：触发隐藏的 input 元素（仅支持选文件）
                if (!isFolder && this.fileInput) {
                    this.fileInput.click();
                } else if (isFolder) {
                    console.warn('Web 环境不支持直接打开文件夹选择器');
                    this.showNotification('当前环境不支持直接打开文件夹', 'warning');
                } else {
                    console.error('未找到 fileInput 元素');
                }
            }
        } finally {
            this.isFileDialogOpen = false;
        }
    }

    async addFilePathsToPlaylist(filePaths) {
        // 检查是否需要清空原有列表
        const clearListOnOpen = document.getElementById('clearListOnOpen')?.checked || false;
        if (clearListOnOpen && this.playlist.length > 0) {
            this.playlist = [];
            this.currentIndex = -1;
        }

        const newItems = [];
        for (const filePath of filePaths) {
            const fileName = filePath.split(/[\\\/]/).pop();
            
            let fileSize = 0;
            let duration = 0;
            
            // 通过主进程获取视频信息（包含文件大小和时长）
            if (window.electronAPI && window.electronAPI.getVideoInfo) {
                try {
                    const infoResult = await window.electronAPI.getVideoInfo(filePath);
                    if (infoResult && infoResult.success && infoResult.info) {
                        if (infoResult.info.size != null) {
                            fileSize = Number(infoResult.info.size) || 0;
                        }
                        if (infoResult.info.duration != null) {
                            duration = Number(infoResult.info.duration) || 0;
                        }
                    }
                } catch (err) {
                    console.warn(`获取视频信息失败: ${filePath}`, err);
                }
            }
            
            newItems.push({
                name: fileName,
                url: filePath, // 暂时存路径，loadVideo 时处理
                filePath: filePath,
                size: fileSize,
                duration: duration
            });
        }

        this.playlist.push(...newItems);
        this.updatePlaylistUI();
        
        if (this.currentIndex === -1 && this.playlist.length > 0) {
            this.loadVideo(this.playlist.length - newItems.length);
        }
    }

    handleFileSelect(e) {
        const files = Array.from(e.target.files);
        this.addFilesToPlaylist(files);
        e.target.value = ''; // 清空以便再次选择同一文件
    }

    async addFilesToPlaylist(files) {
        // 检查是否需要清空原有列表
        const clearListOnOpen = document.getElementById('clearListOnOpen')?.checked || false;
        if (clearListOnOpen && this.playlist.length > 0) {
            this.playlist = [];
            this.currentIndex = -1;
        }
        
        const forceExts = ['.avi', '.m2ts', '.mts', '.m2t', '.3gp', '.wmv', '.ts', '.flv', '.gif', '.rm', '.rmvb', '.mpe', '.m2p', '.mpg', '.m4v', '.vob', '.m2v', '.asx', '.f4v'];
        files.forEach(file => {
            const name = file.name || '';
            const lowerName = name.toLowerCase();
            const hasVideoMime = file.type && file.type.startsWith('video/');
            const hasForceExt = forceExts.some(ext => lowerName.endsWith(ext));
            if (hasVideoMime || hasForceExt) {
                this.playlist.push({
                    name,
                    url: URL.createObjectURL(file),
                    filePath: file.path || null,
                    size: file.size,
                    duration: 0
                });
            }
        });
        
        // 检查列表是否超过限制
        const promptCleanup = document.getElementById('promptCleanup')?.checked || false;
        const maxListItems = parseInt(document.getElementById('maxListItems')?.value || 1000);
        
        if (promptCleanup && this.playlist.length > maxListItems) {
            const confirmed = await this.showConfirm(`播放列表已有${this.playlist.length}个文件，超过设定值${maxListItems}个。\n是否清理部分文件？`, 'warning', '播放列表清理');
            if (confirmed) {
                // 保留最新添加的文件
                this.playlist = this.playlist.slice(-maxListItems);
                this.currentIndex = -1;
            }
        }
        
        this.updatePlaylistUI();
        
        if (this.currentIndex === -1 && this.playlist.length > 0) {
            this.loadVideo(0);
        }
    }

    // ========== 全屏 ==========
    toggleFullscreen() {
        const player = document.querySelector('.baofeng-player');
        if (!document.fullscreenElement) {
            player.requestFullscreen().catch(err => {
                console.error('无法进入全屏:', err);
            });
            this.fullscreenBtn.innerHTML = '<i class="fas fa-compress"></i>';
        } else {
            document.exitFullscreen();
            this.fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
        }
    }

    handleFullscreenChange() {
        this.isFullscreen = !!document.fullscreenElement;
        const player = document.querySelector('.baofeng-player');
        
        if (this.isFullscreen) {
            player.classList.add('fullscreen-mode');
            // 全屏模式下默认收起播放列表
            if (!this.playlistPanel.classList.contains('hidden')) {
                this.playlistPanel.classList.add('hidden');
                this.wasPlaylistVisibleBeforeFullscreen = true;
            } else {
                this.wasPlaylistVisibleBeforeFullscreen = false;
            }
            // 进入全屏后3秒自动隐藏控制栏
            this.startFullscreenControlTimer();
            console.log('✅ 已进入全屏模式 - 3秒后自动隐藏控制栏');
        } else {
            player.classList.remove('fullscreen-mode');
            player.classList.remove('hide-controls');
            // 退出全屏时恢复播放列表状态
            if (this.wasPlaylistVisibleBeforeFullscreen) {
                this.playlistPanel.classList.remove('hidden');
            }
            this.clearFullscreenControlTimer();
            console.log('✅ 已退出全屏模式');
        }
    }

    handleFullscreenMouseMove(e) {
        if (!this.isFullscreen) return;
        
        const player = document.querySelector('.baofeng-player');
        const screenHeight = window.innerHeight;
        const mouseY = e.clientY;
        const showZone = 100; // 顶部和底部100px区域显示控制栏
        
        // 检测鼠标是否在顶部或底部区域
        const isInControlZone = mouseY < showZone || mouseY > screenHeight - showZone;
        
        if (isInControlZone) {
            // 显示控制栏
            player.classList.remove('hide-controls');
            // 重新开始计时
            this.startFullscreenControlTimer();
        } else {
            // 鼠标在中间区域，立即隐藏（如果已经过了初始延迟）
            this.clearFullscreenControlTimer();
            this.fullscreenControlTimer = setTimeout(() => {
                player.classList.add('hide-controls');
            }, 500);
        }
    }

    startFullscreenControlTimer() {
        this.clearFullscreenControlTimer();
        this.fullscreenControlTimer = setTimeout(() => {
            if (this.isFullscreen) {
                const player = document.querySelector('.baofeng-player');
                player.classList.add('hide-controls');
            }
        }, 3000); // 3秒后隐藏
    }

    clearFullscreenControlTimer() {
        if (this.fullscreenControlTimer) {
            clearTimeout(this.fullscreenControlTimer);
            this.fullscreenControlTimer = null;
        }
    }

    // ========== 截图 ==========
    async showScreenshotPreview() {
        if (!await this.auth.ensureAuthorized()) return;
        if (!this.video.src) return;
        
        const canvas = document.createElement('canvas');
        canvas.width = this.video.videoWidth;
        canvas.height = this.video.videoHeight;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(this.video, 0, 0, canvas.width, canvas.height);
        
        // 获取截图数据
        const format = this.screenshotFormat;
        const mimeType = format === 'jpeg' ? 'image/jpeg' : (format === 'bmp' ? 'image/bmp' : 'image/png');
        const quality = format === 'jpeg' ? this.jpegQuality : undefined;
        
        canvas.toBlob((blob) => {
            this.screenshotBlob = blob;
            
            // 判断逻辑：
            // 1. 如果勾选了"不再弹出"，直接保存（不弹出任何对话框）
            // 2. 否则显示预览对话框
            if (this.screenshotNoPopup) {
                this.saveScreenshotDirectly();
                return;
            }
            
            // 默认情况：显示预览对话框
            const url = URL.createObjectURL(blob);
            this.screenshotPreviewImage.src = url;
            this.screenshotPreview.style.display = 'block';
            this.screenshotPreview.classList.add('active');
        }, mimeType, quality);
    }
    
    hideScreenshotPreview() {
        this.screenshotPreview.classList.remove('active');
        this.screenshotPreview.style.display = 'none';
        if (this.screenshotPreviewImage.src) {
            URL.revokeObjectURL(this.screenshotPreviewImage.src);
            this.screenshotPreviewImage.src = '';
        }
        this.screenshotBlob = null;
    }
    
    // 显示截图路径提示
    showScreenshotPathNotification(filePath) {
        if (!this.screenshotPathNotification || !this.screenshotPathLink) return;
        
        // 设置路径链接
        this.screenshotPathLink.textContent = filePath;
        this.screenshotPathLink.onclick = (e) => {
            e.preventDefault();
            // 在资源管理器中打开文件位置
            if (window.electronAPI && window.electronAPI.showItemInFolder) {
                try {
                    window.electronAPI.showItemInFolder(filePath);
                    console.log('在资源管理器中打开:', filePath);
                } catch (error) {
                    console.error('打开文件位置失败:', error);
                }
            }
        };
        
        // 显示提示
        this.screenshotPathNotification.classList.add('active');
        
        // 清除之前的定时器
        if (this.screenshotPathTimer) {
            clearTimeout(this.screenshotPathTimer);
        }
        
        // 3秒后自动隐藏
        this.screenshotPathTimer = setTimeout(() => {
            this.screenshotPathNotification.classList.remove('active');
        }, 3000);
    }
    
    // 显示通用消息通知
    showNotification(message, type = 'info', duration = 3000) {
        if (!this.messageNotification || !this.notificationText) return;
        
        // 设置消息文本
        this.notificationText.textContent = message;
        
        // 清除之前的类型样式
        this.messageNotification.classList.remove('error', 'success', 'warning', 'info');
        
        // 添加新的类型样式
        this.messageNotification.classList.add(type);
        
        // 设置图标
        const icon = this.messageNotification.querySelector('.notification-icon');
        if (icon) {
            switch(type) {
                case 'error':
                    icon.className = 'fas fa-exclamation-circle notification-icon';
                    break;
                case 'success':
                    icon.className = 'fas fa-check-circle notification-icon';
                    break;
                case 'warning':
                    icon.className = 'fas fa-exclamation-triangle notification-icon';
                    break;
                case 'info':
                default:
                    icon.className = 'fas fa-info-circle notification-icon';
                    break;
            }
        }
        
        // 显示通知
        this.messageNotification.classList.add('active');
        
        // 清除之前的定时器
        if (this.notificationTimer) {
            clearTimeout(this.notificationTimer);
        }
        
        // 自动隐藏
        this.notificationTimer = setTimeout(() => {
            this.messageNotification.classList.remove('active');
        }, duration);
        
        console.log(`通知 [${type}]: ${message}`);
    }

    /**
     * 显示消息（兼容 showMessage 调用）
     */
    showMessage(message, type = 'info', duration = 3000) {
        return this.showNotification(message, type, duration);
    }

    /**
     * 右下角续播小提示，返回 Promise<boolean>（续播=true，取消=false）
     * 若长时间未点击则自动消失（视为取消），并显示剩余秒数
     */
    showResumePrompt(message, autoCloseSeconds = 10) {
        const toast = document.getElementById('resumePromptToast');
        const textEl = document.getElementById('resumePromptText');
        const countdownEl = document.getElementById('resumePromptCountdown');
        const btnYes = document.getElementById('resumePromptYes');
        const btnNo = document.getElementById('resumePromptNo');
        if (!toast || !textEl || !btnYes || !btnNo) {
            return Promise.resolve(false);
        }
        textEl.textContent = message;
        toast.classList.add('active');
        let timeoutId = null;
        let intervalId = null;
        const t = typeof this.i18n !== 'undefined' && this.i18n.t ? this.i18n.t.bind(this.i18n) : (k, opts) => (opts && opts.seconds != null ? k.replace('{{seconds}}', opts.seconds) : k);
        const updateCountdown = (sec) => {
            if (countdownEl) countdownEl.textContent = sec > 0 ? t('dialog.resume_auto_close', { seconds: sec }) : '';
        };
        updateCountdown(autoCloseSeconds);
        return new Promise((resolve) => {
            const cleanup = (result) => {
                if (timeoutId) clearTimeout(timeoutId);
                if (intervalId) clearInterval(intervalId);
                toast.classList.remove('active');
                if (countdownEl) countdownEl.textContent = '';
                btnYes.removeEventListener('click', onYes);
                btnNo.removeEventListener('click', onNo);
                resolve(result);
            };
            const onYes = () => cleanup(true);
            const onNo = () => cleanup(false);
            let startTime = Date.now();
            timeoutId = setTimeout(() => cleanup(false), autoCloseSeconds * 1000);
            intervalId = setInterval(() => {
                const elapsed = Math.floor((Date.now() - startTime) / 1000);
                const left = Math.max(0, autoCloseSeconds - elapsed);
                updateCountdown(left);
            }, 1000);
            btnYes.addEventListener('click', onYes);
            btnNo.addEventListener('click', onNo);
        });
    }
    
    // 直接保存截图到设置的路径（不弹出对话框）
    saveScreenshotDirectly() {
        if (!this.screenshotBlob) return;
        
        // 获取当前时间戳
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const timestamp = `${year}${month}${day}${hours}${minutes}${seconds}`;
        
        // 根据格式设置文件扩展名
        const format = this.screenshotFormat;
        let extension = 'png';
        if (format === 'jpeg') extension = 'jpg';
        else if (format === 'bmp') extension = 'bmp';
        
        const filename = `鲲穹截图${timestamp}.${extension}`;
        
        // 如果已经设置了路径，直接保存
        if (this.screenshotPath && typeof require !== 'undefined') {
            try {
                const fs = require('fs');
                const path = require('path');
                
                const filePath = path.join(this.screenshotPath, filename);
                const reader = new FileReader();
                reader.onload = () => {
                    const buffer = Buffer.from(reader.result);
                    fs.writeFileSync(filePath, buffer);
                    console.log(`截图已保存到: ${filePath}`);
                    
                    // 显示截图路径提示
                    this.showScreenshotPathNotification(filePath);
                };
                reader.readAsArrayBuffer(this.screenshotBlob);
            } catch (error) {
                console.error('保存截图失败:', error);
                alert('保存截图失败: ' + error.message);
            }
        } else if (!this.screenshotPath) {
            // 如果没有设置路径，弹出对话框让用户选择路径（只会在第一次截图时出现）
            // 显示预览对话框并自动保存
            const url = URL.createObjectURL(this.screenshotBlob);
            this.screenshotPreviewImage.src = url;
            this.screenshotPreview.style.display = 'block';
            this.screenshotPreview.classList.add('active');
            console.log('首次截图，请选择保存路径');
        } else {
            // 浏览器环境：使用默认下载方式
            const url = URL.createObjectURL(this.screenshotBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
            console.log(`截图已保存: ${filename}`);
        }
    }
    
    saveScreenshot() {
        if (!this.screenshotBlob) return;
        
        // 获取当前时间戳
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const timestamp = `${year}${month}${day}${hours}${minutes}${seconds}`;
        
        // 根据格式设置文件扩展名
        const format = this.screenshotFormat;
        let extension = 'png';
        if (format === 'jpeg') extension = 'jpg';
        else if (format === 'bmp') extension = 'bmp';
        
        const filename = `鲲穹截图${timestamp}.${extension}`;
        
        // Electron环境
        if (typeof require !== 'undefined') {
            try {
                const fs = require('fs');
                const path = require('path');
                
                // 如果已经设置了截图路径，直接保存到该路径
                if (this.screenshotPath) {
                    // 直接保存到设置的路径
                    const filePath = path.join(this.screenshotPath, filename);
                    const reader = new FileReader();
                    reader.onload = () => {
                        const buffer = Buffer.from(reader.result);
                        fs.writeFileSync(filePath, buffer);
                        console.log(`截图已保存到: ${filePath}`);
                        
                        // 显示截图路径提示
                        this.showScreenshotPathNotification(filePath);
                        
                        // 自动打开截图所在文件夹
                        if (window.electronAPI && window.electronAPI.showItemInFolder) {
                            try {
                                window.electronAPI.showItemInFolder(filePath);
                                console.log('已在资源管理器中打开截图位置');
                            } catch (error) {
                                console.error('打开文件位置失败:', error);
                            }
                        }
                    };
                    reader.readAsArrayBuffer(this.screenshotBlob);
                } else {
                    // 弹出系统对话框让用户选择保存位置
                    // 尝试多种方式获取dialog
                    let dialog;
                    if (window.electronAPI && window.electronAPI.showSaveDialog) {
                        // 使用IPC方式（推荐）
                        window.electronAPI.showSaveDialog({
                            title: '保存截图',
                            defaultPath: this.screenshotPath ? path.join(this.screenshotPath, filename) : filename,
                            filters: [
                                { name: 'PNG 图片文件', extensions: ['png'] },
                                { name: 'JPG 图片文件', extensions: ['jpg', 'jpeg'] },
                                { name: 'BMP 图片文件', extensions: ['bmp'] }
                            ]
                        }).then(result => {
                            if (!result.canceled && result.filePath) {
                                // 保存截图路径
                                this.screenshotPath = path.dirname(result.filePath);
                                localStorage.setItem('screenshot_path', this.screenshotPath);
                                
                                // 更新路径显示
                                const pathDisplay = document.getElementById('screenshotPathDisplay');
                                if (pathDisplay) {
                                    pathDisplay.value = this.screenshotPath;
                                }
                                
                                // 保存截图
                                const reader = new FileReader();
                                reader.onload = () => {
                                    const buffer = Buffer.from(reader.result);
                                    fs.writeFileSync(result.filePath, buffer);
                                    console.log(`截图已保存到: ${result.filePath}`);
                                    
                                    // 显示截图路径提示
                                    this.showScreenshotPathNotification(result.filePath);
                                };
                                reader.readAsArrayBuffer(this.screenshotBlob);
                            }
                        });
                        return; // 使用IPC方式，直接返回
                    }
                    
                    // 备用方式：直接使用dialog
                    try {
                        dialog = require('electron').remote?.dialog;
                        if (!dialog) {
                            const remote = require('@electron/remote');
                            dialog = remote.dialog;
                        }
                    } catch (e) {
                        console.error('无法获取dialog:', e);
                    }
                    
                    if (dialog) {
                        dialog.showSaveDialog({
                            title: '保存截图',
                            defaultPath: this.screenshotPath ? path.join(this.screenshotPath, filename) : filename,
                            filters: [
                                { name: 'PNG 图片文件', extensions: ['png'] },
                                { name: 'JPG 图片文件', extensions: ['jpg', 'jpeg'] },
                                { name: 'BMP 图片文件', extensions: ['bmp'] }
                            ]
                        }).then(result => {
                            if (!result.canceled && result.filePath) {
                                // 保存截图路径
                                this.screenshotPath = path.dirname(result.filePath);
                                localStorage.setItem('screenshot_path', this.screenshotPath);
                                
                                // 更新路径显示
                                const pathDisplay = document.getElementById('screenshotPathDisplay');
                                if (pathDisplay) {
                                    pathDisplay.value = this.screenshotPath;
                                }
                                
                                // 保存截图
                                const reader = new FileReader();
                                reader.onload = () => {
                                    const buffer = Buffer.from(reader.result);
                                    fs.writeFileSync(result.filePath, buffer);
                                    console.log(`截图已保存到: ${result.filePath}`);
                                    
                                    // 显示截图路径提示
                                    this.showScreenshotPathNotification(result.filePath);
                                    
                                    // 自动打开截图所在文件夹
                                    if (window.electronAPI && window.electronAPI.showItemInFolder) {
                                        try {
                                            window.electronAPI.showItemInFolder(result.filePath);
                                            console.log('已在资源管理器中打开截图位置');
                                        } catch (error) {
                                            console.error('打开文件位置失败:', error);
                                        }
                                    }
                                };
                                reader.readAsArrayBuffer(this.screenshotBlob);
                            }
                        });
                    } else {
                        console.error('无法获取dialog API');
                        alert('无法打开文件保存对话框，请检查应用配置');
                    }
                }
            } catch (error) {
                console.error('保存截图失败:', error);
                alert('保存截图失败: ' + error.message);
            }
        } else {
            // 浏览器环境：使用默认下载方式
            const url = URL.createObjectURL(this.screenshotBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
            console.log(`截图已保存: ${filename}`);
        }
        
        // 关闭预览对话框
        this.hideScreenshotPreview();
    }
    
    // ========== 视频属性 ==========
    showVideoProperties() {
        if (!this.video.src) {
            this.showNotification('请先加载视频文件', 'warning');
            return;
        }
        
        // 更新属性信息
        const currentItem = this.playlist[this.currentIndex];
        if (currentItem) {
            this.propertiesFilename.textContent = currentItem.name;
            this.propertiesLocation.textContent = currentItem.url.startsWith('blob:')
                ? '（内存预览 / Blob）'
                : currentItem.url;
            this.propertiesSize.textContent = this.formatFileSize(currentItem.size);
        } else {
            this.propertiesFilename.textContent = '未知视频';
            this.propertiesLocation.textContent = this.video.src;
            this.propertiesSize.textContent = '-';
        }
        
        // 基本信息
        this.propertiesType.textContent = '视频';
        
        // 视频时长
        if (this.video.duration && !isNaN(this.video.duration)) {
            const hours = Math.floor(this.video.duration / 3600);
            const minutes = Math.floor((this.video.duration % 3600) / 60);
            const seconds = Math.floor(this.video.duration % 60);
            
            if (hours > 0) {
                this.propertiesDuration.textContent = 
                    `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            } else {
                this.propertiesDuration.textContent = 
                    `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            }
        } else {
            this.propertiesDuration.textContent = '-';
        }
        
        // 详细信息（视频区域）
        // 视频分辨率
        if (this.video.videoWidth && this.video.videoHeight) {
            const aspectRatio = (this.video.videoWidth / this.video.videoHeight).toFixed(2);
            this.propertiesResolution.textContent = 
                `${this.video.videoWidth}×${this.video.videoHeight} (${aspectRatio}: 1)`;
        } else {
            this.propertiesResolution.textContent = '-';
        }
        
        // 视频编码（尝试从视频类型获取）
        if (this.video.src) {
            const extension = currentItem ? currentItem.name.split('.').pop().toLowerCase() : 'mp4';
            let codec = 'avc1'; // 默认H.264
            
            if (extension === 'webm') {
                codec = 'vp8/vp9';
            } else if (extension === 'ogv') {
                codec = 'theora';
            } else if (extension === 'avi') {
                codec = 'xvid/divx';
            }
            
            this.propertiesCodec.textContent = codec;
        } else {
            this.propertiesCodec.textContent = '-';
        }
        
        // 帧率（估算，HTML5不提供精确值）
        this.propertiesFramerate.textContent = '25.00 fps';
        
        // 比特率（估算）
        if (currentItem && currentItem.size && this.video.duration) {
            const bitrate = (currentItem.size * 8) / this.video.duration / 1000; // Kbps
            this.propertiesBitrate.textContent = bitrate.toFixed(2) + ' Kbps';
        } else {
            this.propertiesBitrate.textContent = '-';
        }
        
        // 重置"更多信息"展开状态
        if (this.propertiesDetails) {
            this.propertiesDetails.classList.remove('active');
        }
        if (this.btnMoreInfo) {
            this.btnMoreInfo.classList.remove('expanded');
            const btnText = this.btnMoreInfo.querySelector('span');
            if (btnText) btnText.textContent = '更多信息';
        }
        
        // 显示对话框
        this.videoProperties.style.display = 'block';
        this.videoProperties.classList.add('active');
    }
    
    hideVideoProperties() {
        this.videoProperties.classList.remove('active');
        this.videoProperties.style.display = 'none';
    }
    
    toggleMoreInfo() {
        if (!this.propertiesDetails || !this.btnMoreInfo) return;
        
        const isExpanded = this.propertiesDetails.classList.toggle('active');
        this.btnMoreInfo.classList.toggle('expanded');
        
        const btnText = this.btnMoreInfo.querySelector('span');
        if (btnText) {
            btnText.textContent = isExpanded ? '收起信息' : '更多信息';
        }
    }
    
    // ========== 最小界面模式 ==========
    toggleCompactMode() {
        const { ipcRenderer } = require('electron');
        
        // 获取当前窗口大小
        const currentWindow = require('electron').remote?.getCurrentWindow() || require('@electron/remote').getCurrentWindow();
        const currentBounds = currentWindow.getBounds();
        
        // 检查是否已经是最小界面
        const isCompact = currentBounds.width <= 400;
        
        if (isCompact) {
            // 恢复正常大小
            currentWindow.setBounds({
                width: 1200,
                height: 700,
                x: Math.floor((screen.availWidth - 1200) / 2),
                y: Math.floor((screen.availHeight - 700) / 2)
            });
        } else {
            // 切换到最小界面
            currentWindow.setBounds({
                width: 380,
                height: 500,
                x: currentBounds.x,
                y: currentBounds.y
            });
        }
    }

    // ========== 拖放 ==========
    onDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        this.videoArea.classList.add('dragover');
    }

    onDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        this.videoArea.classList.remove('dragover');
    }

    onDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        this.videoArea.classList.remove('dragover');
        
        const files = Array.from(e.dataTransfer.files);
        this.addFilesToPlaylist(files);
    }

    // ========== 右键菜单 ==========
    showContextMenu(e) {
        e.preventDefault();
        
        // 更新播放/暂停按钮状态
        const contextPlayPauseText = document.getElementById('contextPlayPauseText');
        const contextPlayPauseIcon = document.getElementById('contextPlayPauseIcon');
        const contextPlayPauseItem = document.getElementById('contextPlayPauseItem');
        
        if (contextPlayPauseText && contextPlayPauseIcon && contextPlayPauseItem) {
            if (!this.video.src || this.video.src === '') {
                // 没有视频，显示播放
                contextPlayPauseText.textContent = i18n.t('context_menu.play');
                contextPlayPauseIcon.className = 'fas fa-play';
            } else if (this.video.paused) {
                // 视频暂停或停止，显示播放
                contextPlayPauseText.textContent = i18n.t('context_menu.play');
                contextPlayPauseIcon.className = 'fas fa-play';
            } else {
                // 视频正在播放，显示暂停
                contextPlayPauseText.textContent = i18n.t('context_menu.pause');
                contextPlayPauseIcon.className = 'fas fa-pause';
            }
        }
        
        // 更新全屏按钮文本
        const contextFullscreenText = document.getElementById('contextFullscreenText');
        const contextFullscreenItem = document.getElementById('contextFullscreenItem');
        if (contextFullscreenText && contextFullscreenItem) {
            if (document.fullscreenElement) {
                contextFullscreenText.textContent = i18n.t('context_menu.exit_fullscreen');
                contextFullscreenItem.querySelector('i').className = 'fas fa-compress';
            } else {
                contextFullscreenText.textContent = i18n.t('context_menu.fullscreen');
                contextFullscreenItem.querySelector('i').className = 'fas fa-expand';
            }
        }
        // 画中画菜单项：根据是否在画中画更新文案，不支持时隐藏
        const contextPipItem = document.getElementById('contextPipItem');
        const contextPipText = document.getElementById('contextPipText');
        if (contextPipItem && contextPipText) {
            if (this.isPipSupported?.()) {
                contextPipItem.style.display = '';
                contextPipText.textContent = document.pictureInPictureElement
                    ? i18n.t('context_menu.exit_pip')
                    : i18n.t('context_menu.pip');
            } else {
                contextPipItem.style.display = 'none';
            }
        }
        this.updateABLoopUI?.();
        // 按当前语言更新右键菜单其余项
        const ctxStop = document.getElementById('contextStopText');
        const ctxPrev = document.getElementById('contextPrevText');
        const ctxNext = document.getElementById('contextNextText');
        const ctxScreenshot = document.getElementById('contextScreenshotText');
        const ctxPicture = document.getElementById('contextPictureText');
        const ctxAudio = document.getElementById('contextAudioText');
        const ctxOpen = document.getElementById('contextOpenText');
        const ctxProperties = document.getElementById('contextPropertiesText');
        const ctxSettings = document.getElementById('contextSettingsText');
        if (ctxStop) ctxStop.textContent = i18n.t('context_menu.stop');
        if (ctxPrev) ctxPrev.textContent = i18n.t('context_menu.prev');
        if (ctxNext) ctxNext.textContent = i18n.t('context_menu.next');
        if (ctxScreenshot) ctxScreenshot.textContent = i18n.t('context_menu.screenshot');
        if (ctxPicture) ctxPicture.textContent = i18n.t('context_menu.picture');
        if (ctxAudio) ctxAudio.textContent = i18n.t('context_menu.audio');
        if (ctxOpen) ctxOpen.textContent = i18n.t('context_menu.open');
        if (ctxProperties) ctxProperties.textContent = i18n.t('context_menu.properties');
        if (ctxSettings) ctxSettings.textContent = i18n.t('context_menu.settings');
        const ctxAddFav = document.getElementById('contextAddToFavoritesText');
        const ctxShowFav = document.getElementById('contextShowFavoritesText');
        const ctxShowRecent = document.getElementById('contextShowRecentText');
        if (ctxAddFav) ctxAddFav.textContent = i18n.t('favorites.add_to_favorites');
        if (ctxShowFav) ctxShowFav.textContent = i18n.t('favorites.my_favorites');
        if (ctxShowRecent) ctxShowRecent.textContent = i18n.t('recent.title');
        
        // 获取窗口尺寸和菜单尺寸
        const winWidth = window.innerWidth;
        const winHeight = window.innerHeight;
        
        // 暂时显示以获取尺寸
        this.contextMenu.style.display = 'block';
        const menuWidth = this.contextMenu.offsetWidth;
        const menuHeight = this.contextMenu.offsetHeight;
        
        // 计算位置，防止溢出屏幕
        let x = e.clientX;
        let y = e.clientY;
        
        if (x + menuWidth > winWidth) x = winWidth - menuWidth;
        if (y + menuHeight > winHeight) y = winHeight - menuHeight;
        
        this.contextMenu.style.left = `${x}px`;
        this.contextMenu.style.top = `${y}px`;
        this.contextMenu.classList.add('active');
    }

    hideContextMenu() {
        this.contextMenu.classList.remove('active');
        // 延迟隐藏以允许动画
        setTimeout(() => {
            if (!this.contextMenu.classList.contains('active')) {
                this.contextMenu.style.display = 'none';
            }
        }, 200);
    }

    handleContextAction(action, e) {
        switch (action) {
            case 'playPause':
                // 智能切换：正在播放时暂停，暂停/停止时播放
                if (!this.video.src || this.video.src === '') {
                    // 没有视频，不做处理
                    return;
                } else if (this.video.paused) {
                    // 暂停或停止状态，开始播放
                    this.video.play();
                } else {
                    // 正在播放，暂停视频
                    this.video.pause();
                }
                break;
            case 'play':
                if (this.video.paused) this.video.play();
                break;
            case 'pause':
                this.video.pause();
                break;
            case 'stop':
                this.stop();
                break;
            case 'prev':
                this.playPrevious();
                break;
            case 'next':
                this.playNext();
                break;
            case 'speed':
                const speed = e ? parseFloat(e.target.dataset.speed) : null;
                if (speed) this.setSpeed(speed);
                break;
            case 'fullscreen':
                this.toggleFullscreen();
                break;
            case 'screenshot':
                this.showScreenshotPreview();
                break;
            case 'pip':
                this.togglePip?.();
                break;
            case 'abSetA':
                this.setABPointA?.();
                break;
            case 'abSetB':
                this.setABPointB?.();
                break;
            case 'abClear':
                this.clearABLoop?.();
                break;
            case 'abToggle':
                this.toggleABLoop?.();
                break;
            case 'addToFavorites':
                this.addToFavorites?.();
                break;
            case 'showFavorites':
                this.switchToFavoritesTab?.();
                break;
            case 'showRecent':
                this.switchToRecentTab?.();
                break;
            case 'playlist':
                this.togglePlaylist();
                break;
            case 'pictureQuality':
                const isActive = this.pictureQualityPanel.classList.toggle('active');
                if (isActive) {
                    this.pictureQualityBtn.classList.add('active');
                    this.audioAdjustPanel.classList.remove('active');
                    this.audioAdjustBtn.classList.remove('active');
                } else {
                    this.pictureQualityBtn.classList.remove('active');
                }
                break;
            case 'audioAdjust':
                const isAudioActive = this.audioAdjustPanel.classList.toggle('active');
                if (isAudioActive) {
                    this.audioAdjustBtn.classList.add('active');
                    this.pictureQualityPanel.classList.remove('active');
                    this.pictureQualityBtn.classList.remove('active');
                } else {
                    this.audioAdjustBtn.classList.remove('active');
                }
                break;
            case 'open':
                this.openFileDialog();
                break;
            case 'properties':
                this.showVideoProperties();
                break;
            case 'settings':
                this.openSettings();
                break;
        }
        this.hideContextMenu();
    }

    // ========== 键盘快捷键 ==========
    handleKeyboard(e) {
        // 避免在输入框中触发
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
        
        // 构建当前按键组合
        const keyCombo = this.getKeyCombo(e);
        
        // 调试日志：帮助定位快捷键问题
        console.log('按键组合:', keyCombo, 'Action:', Object.entries(this.hotkeys).find(([_, h]) => h === keyCombo)?.[0]);
        
        // 查找匹配的热键并执行对应功能
        for (const [action, hotkey] of Object.entries(this.hotkeys)) {
            if (keyCombo === hotkey) {
                // 立即阻止默认行为，特别是 Ctrl+O 这种浏览器默认快捷键
                e.preventDefault();
                e.stopPropagation();
                
                this.executeHotkeyAction(action);
                return;
            }
        }
    }

    getKeyCombo(e) {
        const parts = [];
        if (e.ctrlKey) parts.push('Ctrl');
        if (e.altKey) parts.push('Alt');
        if (e.shiftKey) parts.push('Shift');
        
        let key = e.key;
        
        // 特殊键名映射
        if (key === ' ') {
            key = 'Space';
        } else if (key.length === 1) {
            // 单个字符键转为大写，确保匹配一致性 (如 Ctrl+o 匹配 Ctrl+O)
            key = key.toUpperCase();
        }
        
        // 如果只有修饰键，不添加key
        if (!e.ctrlKey && !e.altKey && !e.shiftKey) {
            // 单键
            if (key === 'Space') {
                return ' ';  // 空格特殊处理
            }
            return key;
        }
        
        parts.push(key);
        return parts.join('+');
    }

    executeHotkeyAction(action) {
        console.log(`执行热键动作: ${action}`);
        switch (action) {
            case 'playPause':
                this.togglePlay();
                break;
                
            case 'stop':
                this.stop();
                console.log('热键: 停止');
                break;
                
            case 'fastForward':
                if (this.video.duration) {
                    const step = this.fastForwardStep || 1;
                    this.video.currentTime = Math.min(this.video.currentTime + step, this.video.duration);
                    this.showVideoInfo(`快进: +${step}s`);
                    console.log('热键: 快进', step + '秒');
                }
                break;
                
            case 'rewind':
                if (this.video.duration) {
                    const step = this.rewindStep || 1;
                    this.video.currentTime = Math.max(this.video.currentTime - step, 0);
                    this.showVideoInfo(`快退: -${step}s`);
                    console.log('热键: 快退', step + '秒');
                }
                break;
                
            case 'speedUp':
                const speedStep = this.speedStep || 0.25;
                const newSpeedUp = Math.min(this.playbackRate + speedStep, 4.0);
                this.setSpeed(newSpeedUp);
                this.showVideoInfo(`倍速: ${newSpeedUp}x`);
                console.log('热键: 加速播放至', newSpeedUp + 'x');
                break;
                
            case 'speedDown':
                const speedStepDown = this.speedStep || 0.25;
                const newSpeedDown = Math.max(this.playbackRate - speedStepDown, 0.25);
                this.setSpeed(newSpeedDown);
                this.showVideoInfo(`倍速: ${newSpeedDown}x`);
                console.log('热键: 减速播放至', newSpeedDown + 'x');
                break;
                
            case 'volumeUp':
                const newVolumeUp = Math.min(this.volume + 5, 100);
                this.setVolume(newVolumeUp);
                if (this.volumeSlider) this.volumeSlider.value = newVolumeUp;
                this.showVideoInfo(`音量: ${newVolumeUp}%`);
                console.log('热键: 音量增加至', newVolumeUp + '%');
                break;
                
            case 'volumeDown':
                const newVolumeDown = Math.max(this.volume - 5, 0);
                this.setVolume(newVolumeDown);
                if (this.volumeSlider) this.volumeSlider.value = newVolumeDown;
                this.showVideoInfo(`音量: ${newVolumeDown}%`);
                console.log('热键: 音量减小至', newVolumeDown + '%');
                break;
                
            case 'mute':
                this.toggleMute();
                break;
                
            case 'fullscreen':
                this.toggleFullscreen();
                break;
                
            case 'exitFullscreen':
                if (document.fullscreenElement) {
                    document.exitFullscreen();
                    console.log('热键: 退出全屏');
                }
                // ESC也可以退出关灯模式
                if (this.isLightsOff) {
                    this.toggleLightsOff();
                }
                break;
                
            case 'lightsOff':
                this.toggleLightsOff();
                break;
                
            case 'openUrl':
                this.openURL();
                break;
                
            case 'openFile':
                this.openFileDialog();
                console.log('热键: 打开文件');
                break;
        }
    }

    // ========== 打开URL ==========
    async openURL() {
        if (!await this.auth.ensureAuthorized()) return;
        console.log('正在打开URL对话框...');
        
        if (!this.urlDialog || !this.urlInput) {
            this.urlDialog = document.getElementById('urlDialog');
            this.urlInput = document.getElementById('urlInput');
        }

        if (!this.urlDialog) {
            console.error('未找到 URL 对话框元素');
            return;
        }

        // 显示对话框
        this.urlDialog.classList.add('active');
        this.urlDialog.style.display = 'flex'; // 使用 flex 居中显示
        if (this.urlInput) {
            this.urlInput.value = '';
            setTimeout(() => this.urlInput.focus(), 100);
        }
    }

    initUrlDialogEvents() {
        const closeBtn = document.getElementById('closeUrlDialog');
        const cancelBtn = document.getElementById('cancelUrlDialog');
        const confirmBtn = document.getElementById('confirmUrlDialog');
        const urlInput = document.getElementById('urlInput');

        const closeDialog = () => {
            if (this.urlDialog) {
                this.urlDialog.classList.remove('active');
                this.urlDialog.style.display = 'none';
            }
        };

        if (closeBtn) closeBtn.onclick = closeDialog;
        if (cancelBtn) cancelBtn.onclick = closeDialog;
        
        if (confirmBtn && urlInput) {
            confirmBtn.onclick = () => {
                const url = urlInput.value.trim();
                if (url) {
                    this.playUrl(url);
                    closeDialog();
                } else {
                    this.showVideoInfo('请输入有效的 URL');
                }
            };

            urlInput.onkeypress = (e) => {
                if (e.key === 'Enter') confirmBtn.click();
            };
        }
    }

    // 获取在线文件大小
    async getOnlineFileSize(url) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5秒超时
            
            const response = await fetch(url, { 
                method: 'HEAD',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                const contentLength = response.headers.get('content-length');
                return contentLength ? parseInt(contentLength, 10) : 0;
            }
        } catch (e) {
            console.warn('获取在线文件大小失败:', e);
        }
        return 0;
    }

    async playUrl(url) {
        try {
            console.log('准备播放 URL:', url);
            
            // 自动补全协议
            let targetUrl = url;
            if (!/^https?:\/\//i.test(url) && !/^ftp:\/\//i.test(url) && !/^rtmp:\/\//i.test(url)) {
                targetUrl = 'http://' + url;
            }
            
            // 验证URL格式
            const urlObj = new URL(targetUrl);
            
            // 严格校验：主机名必须包含点号（排除 localhost 和 IPv6）
            // 拦截类似 "abc", "test" 这种无效域名，避免进入加载流程
            if (urlObj.hostname !== 'localhost' && !urlObj.hostname.includes('.') && !urlObj.hostname.includes(':')) {
                throw new Error('URL 格式无效');
            }
            
            // 隐藏欢迎界面
            if (this.welcomeScreen) this.welcomeScreen.style.display = 'none';
            
            // 添加到播放列表
            const item = {
                name: '在线视频 - ' + (this.getUrlFilename(targetUrl) || targetUrl.substring(0, 50)),
                url: targetUrl,
                size: 0,
                duration: 0,
                isOnline: true
            };
            
            this.playlist.push(item);
            this.currentIndex = this.playlist.length - 1;
            await this.loadVideo(this.currentIndex);
            this.showVideoInfo('正在加载在线视频...');
            
            // 异步获取在线视频大小并更新列表
            this.getOnlineFileSize(targetUrl).then(size => {
                if (size > 0) {
                    // 查找对应的播放列表项（因为在此期间列表可能已变动）
                    const index = this.playlist.findIndex(i => i.url === targetUrl);
                    if (index !== -1) {
                        this.playlist[index].size = size;
                        this.updatePlaylistUI();
                    }
                }
            });
        } catch (e) {
            console.error('URL 错误:', e);
            this.showVideoInfo(e.message || 'URL 格式不正确');
            this.showMessage(e.message || '无法播放该 URL', 'error');
        }
    }
    
    // 显示视频信息提示（OSD）
    showVideoInfo(text, duration = 2000) {
        if (!this.videoInfoOverlay) {
            this.videoInfoOverlay = document.getElementById('videoInfoOverlay');
        }
        
        if (this.videoInfoOverlay) {
            this.videoInfoOverlay.textContent = text;
            this.videoInfoOverlay.classList.add('active');
            
            if (this.videoInfoTimer) {
                clearTimeout(this.videoInfoTimer);
            }
            
            this.videoInfoTimer = setTimeout(() => {
                this.videoInfoOverlay.classList.remove('active');
            }, duration);
        }
    }

    // 从URL中提取文件名
    getUrlFilename(url) {
        try {
            const urlObj = new URL(url);
            const pathname = urlObj.pathname;
            const filename = pathname.substring(pathname.lastIndexOf('/') + 1);
            return decodeURIComponent(filename) || null;
        } catch (e) {
            return null;
        }
    }

    // ========== 加载/保存设置 ==========
    loadSettings() {
        try {
            const settings = JSON.parse(localStorage.getItem('baofeng_settings') || '{}');
            if (settings.volume !== undefined) {
                this.setVolume(settings.volume);
                this.volumeSlider.value = settings.volume;
            }
            // 播放速度不从localStorage加载，始终使用默认值1.0x
            // 每次启动时重置为1.0x
            this.setSpeed(1.0);
            
            if (settings.playMode !== undefined) {
                this.playMode = settings.playMode;
                this.updatePlayModeButton();
            }

            // 恢复画面比例设置
            if (settings.currentAspectRatio !== undefined) {
                this.currentAspectRatio = settings.currentAspectRatio;
                // 更新单选按钮状态
                const ratioRadio = document.querySelector(`input[name="ratio"][value="${settings.currentAspectRatio}"]`);
                if (ratioRadio) ratioRadio.checked = true;
                // 应用比例
                if (this.video) {
                    this.changeAspectRatio(this.currentAspectRatio);
                }
            }

            // 加载截图设置
            if (settings.screenshotPath !== undefined) {
                this.screenshotPath = settings.screenshotPath;
                const pathInput = document.getElementById('screenshotPath');
                if (pathInput) pathInput.value = settings.screenshotPath;
            }
            if (settings.screenshotPrefix !== undefined) {
                this.screenshotPrefix = settings.screenshotPrefix;
                const prefixInput = document.getElementById('screenshotPrefix');
                if (prefixInput) prefixInput.value = settings.screenshotPrefix;
            }
            if (settings.screenshotFormat !== undefined) {
                this.screenshotFormat = settings.screenshotFormat;
                const formatRadio = document.querySelector(`input[name="screenshot-format"][value="${settings.screenshotFormat}"]`);
                if (formatRadio) formatRadio.checked = true;
            }
            if (settings.jpegQuality !== undefined) {
                this.jpegQuality = settings.jpegQuality;
                const qualitySlider = document.getElementById('jpegQuality');
                const qualityValue = document.getElementById('jpegQualityValue');
                if (qualitySlider) qualitySlider.value = settings.jpegQuality * 100;
                if (qualityValue) qualityValue.textContent = Math.round(settings.jpegQuality * 100) + '%';
            }
            this.loadControlSettings();
        } catch (e) {
            console.error('加载设置失败:', e);
        }
    }

    loadControlSettings() {
        try {
            const raw = localStorage.getItem('baofeng_control_settings');
            if (!raw) return;
            const s = JSON.parse(raw);
            if (s.leftEyeOn !== undefined) this.leftEyeOn = s.leftEyeOn;
            if (s.leftEyeViewAngle !== undefined) this.leftEyeViewAngle = s.leftEyeViewAngle;
            if (s.leftEyeBrightness !== undefined) this.leftEyeBrightness = s.leftEyeBrightness;
            if (s.leftEyeContrast !== undefined) this.leftEyeContrast = s.leftEyeContrast;
            if (s.surroundOn !== undefined) this.surroundOn = s.surroundOn;
            if (s.surroundMode !== undefined) this.surroundMode = s.surroundMode;
            if (s.surroundIntensity !== undefined) this.surroundIntensity = s.surroundIntensity;
            if (s.surroundBass !== undefined) this.surroundBass = s.surroundBass;
            if (s.threeDOn !== undefined) this.threeDOn = s.threeDOn;
            if (s.threeDMode !== undefined) this.threeDMode = s.threeDMode;
            if (s.threeDDepth !== undefined) this.threeDDepth = s.threeDDepth;
            if (s.eyeDistance !== undefined) this.eyeDistance = s.eyeDistance;
            const toggleLeftEye = document.getElementById('toggleLeftEye');
            if (toggleLeftEye) toggleLeftEye.checked = this.leftEyeOn;
            const toggleSurroundSound = document.getElementById('toggleSurroundSound');
            if (toggleSurroundSound) toggleSurroundSound.checked = this.surroundOn;
            const toggle3D = document.getElementById('toggle3D');
            if (toggle3D) toggle3D.checked = this.threeDOn;
            const viewAngleSlider = document.getElementById('leftEyeViewAngle');
            const viewAngleValue = document.getElementById('leftEyeViewAngleValue');
            if (viewAngleSlider && viewAngleValue) {
                viewAngleSlider.value = this.leftEyeViewAngle;
                viewAngleValue.textContent = this.leftEyeViewAngle + '°';
            }
            const brightnessSlider = document.getElementById('leftEyeBrightness');
            const brightnessValue = document.getElementById('leftEyeBrightnessValue');
            if (brightnessSlider && brightnessValue) {
                brightnessSlider.value = this.leftEyeBrightness;
                brightnessValue.textContent = this.leftEyeBrightness + '%';
            }
            const contrastSlider = document.getElementById('leftEyeContrast');
            const contrastValue = document.getElementById('leftEyeContrastValue');
            if (contrastSlider && contrastValue) {
                contrastSlider.value = this.leftEyeContrast;
                contrastValue.textContent = this.leftEyeContrast + '%';
            }
            const surroundModeRadios = document.querySelectorAll('input[name="surroundMode"]');
            surroundModeRadios.forEach(r => { if (r.value === this.surroundMode) r.checked = true; });
            const intensitySlider = document.getElementById('surroundIntensity');
            const intensityValue = document.getElementById('surroundIntensityValue');
            if (intensitySlider && intensityValue) {
                intensitySlider.value = this.surroundIntensity;
                intensityValue.textContent = this.surroundIntensity + '%';
            }
            const bassBoostSlider = document.getElementById('bassBoost');
            const bassBoostValue = document.getElementById('bassBoostValue');
            if (bassBoostSlider && bassBoostValue) {
                bassBoostSlider.value = this.surroundBass;
                bassBoostValue.textContent = this.surroundBass + '%';
            }
            const threeDModeRadios = document.querySelectorAll('input[name="threeDMode"]');
            threeDModeRadios.forEach(r => { if (r.value === this.threeDMode) r.checked = true; });
            const depthSlider = document.getElementById('threeDDepth');
            const depthValue = document.getElementById('threeDDepthValue');
            if (depthSlider && depthValue) {
                depthSlider.value = this.threeDDepth;
                depthValue.textContent = this.threeDDepth + '%';
            }
            const eyeDistSlider = document.getElementById('eyeDistance');
            const eyeDistValue = document.getElementById('eyeDistanceValue');
            if (eyeDistSlider && eyeDistValue) {
                eyeDistSlider.value = this.eyeDistance;
                eyeDistValue.textContent = this.eyeDistance;
            }
            this.applyLeftEyeStyle();
            this.ensureSurroundNodes();
            this.applySurroundParams();
            if (this.threeDOn) {
                this.ensureThreeDCanvas();
                this.startThreeDLoop();
            } else {
                this.stopThreeDLoop();
            }
        } catch (e) {
            console.warn('加载控制设置失败:', e);
        }
    }

    saveControlSettings() {
        try {
            const s = {
                leftEyeOn: this.leftEyeOn,
                leftEyeViewAngle: this.leftEyeViewAngle,
                leftEyeBrightness: this.leftEyeBrightness,
                leftEyeContrast: this.leftEyeContrast,
                surroundOn: this.surroundOn,
                surroundMode: this.surroundMode,
                surroundIntensity: this.surroundIntensity,
                surroundBass: this.surroundBass,
                threeDOn: this.threeDOn,
                threeDMode: this.threeDMode,
                threeDDepth: this.threeDDepth,
                eyeDistance: this.eyeDistance
            };
            localStorage.setItem('baofeng_control_settings', JSON.stringify(s));
        } catch (e) {
            console.warn('保存控制设置失败:', e);
        }
    }

    saveSettings() {
        try {
            const settings = {
                volume: this.volume,
                // playbackRate: this.playbackRate, // 不保存播放速度，始终使用默认1.0x
                playMode: this.playMode,
                currentAspectRatio: this.currentAspectRatio, // 保存画面比例
                screenshotPath: this.screenshotPath,
                screenshotPrefix: this.screenshotPrefix,
                screenshotFormat: this.screenshotFormat,
                jpegQuality: this.jpegQuality
            };
            localStorage.setItem('baofeng_settings', JSON.stringify(settings));
        } catch (e) {
            console.error('保存设置失败:', e);
        }
        
        // 保存播放设置
        this.savePlaybackSettings();
    }

    // ========== 全局亮度调节 ==========
    initGlobalBrightness() {
        if (!this.globalBrightnessBtn || !this.brightnessPanel) {
            console.error('全局亮度按钮或面板未找到！');
            return;
        }
        
        // 打开/关闭亮度调节面板
        this.globalBrightnessBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.brightnessPanel.classList.toggle('active');
            this.globalBrightnessBtn.classList.toggle('active');
            
            // 关闭其他面板
            if (this.brightnessPanel.classList.contains('active')) {
                this.pictureQualityPanel?.classList.remove('active');
                this.pictureQualityBtn?.classList.remove('active');
                this.audioAdjustPanel?.classList.remove('active');
                this.audioAdjustBtn?.classList.remove('active');
            }
        });
        
        // 关闭按钮
        this.closeBrightness.addEventListener('click', (e) => {
            e.stopPropagation();
            this.brightnessPanel.classList.remove('active');
            this.globalBrightnessBtn.classList.remove('active');
        });
        
        // 亮度滑块
        this.globalBrightnessSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            this.globalBrightness = value;
            this.brightnessValue.textContent = value + '%';
            this.applyGlobalBrightness();
        });
        
        // 重置按钮
        this.resetGlobalBrightness.addEventListener('click', () => {
            this.globalBrightness = 100;
            this.globalBrightnessSlider.value = 100;
            this.brightnessValue.textContent = '100%';
            this.applyGlobalBrightness();
        });
        
        // 加载保存的亮度
        const savedBrightness = localStorage.getItem('globalBrightness');
        if (savedBrightness) {
            this.globalBrightness = parseInt(savedBrightness);
            this.globalBrightnessSlider.value = this.globalBrightness;
            this.brightnessValue.textContent = this.globalBrightness + '%';
            this.applyGlobalBrightness();
        }
        
        console.log('全局亮度调节初始化成功');
    }
    
    applyGlobalBrightness() {
        const player = document.querySelector('.baofeng-player');
        if (player) {
            player.style.filter = `brightness(${this.globalBrightness / 100})`;
            // 保存设置
            localStorage.setItem('globalBrightness', this.globalBrightness);
        }
    }

    // ========== 控制面板 ==========
    initControlPanel() {
        if (!this.controlMenuBtn || !this.controlPanel) {
            console.error('控制面板按钮或面板未找到！');
            return;
        }
        
        // 打开/关闭控制面板
        this.controlMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.controlPanel.classList.toggle('active');
        });
        
        // 关闭按钮
        if (this.closeControlPanel) {
            this.closeControlPanel.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.controlPanel.classList.remove('active');
            });
        }
        
        // 左眼模式开关
        const toggleLeftEye = document.getElementById('toggleLeftEye');
        const btnLeftEyeSettings = document.getElementById('btnLeftEyeSettings');
        
        if (toggleLeftEye) {
            toggleLeftEye.addEventListener('change', (e) => {
                this.leftEyeOn = e.target.checked;
                console.log('左眼模式:', this.leftEyeOn ? '开启' : '关闭');
                this.applyLeftEyeStyle();
                this.saveControlSettings();
            });
        }
        
        if (btnLeftEyeSettings) {
            btnLeftEyeSettings.addEventListener('click', () => {
                this.leftEyePanel.classList.add('active');
                this.controlPanel.classList.remove('active');
                console.log('打开左眼模式详细设置');
            });
        }
        
        // 环绕声模式开关
        const toggleSurroundSound = document.getElementById('toggleSurroundSound');
        const btnSurroundSoundSettings = document.getElementById('btnSurroundSoundSettings');
        
        if (toggleSurroundSound) {
            toggleSurroundSound.addEventListener('change', (e) => {
                this.surroundOn = e.target.checked;
                console.log('环绕声模式:', this.surroundOn ? '开启' : '关闭');
                this.ensureSurroundNodes();
                this.applySurroundParams();
                this.saveControlSettings();
            });
        }
        
        if (btnSurroundSoundSettings) {
            btnSurroundSoundSettings.addEventListener('click', () => {
                this.surroundSoundPanel.classList.add('active');
                this.controlPanel.classList.remove('active');
                console.log('打开环绕声模式详细设置');
            });
        }
        
        // 3D模式开关
        const toggle3D = document.getElementById('toggle3D');
        const btn3DSettings = document.getElementById('btn3DSettings');
        
        if (toggle3D) {
            toggle3D.addEventListener('change', (e) => {
                this.threeDOn = e.target.checked;
                console.log('3D模式:', this.threeDOn ? '开启' : '关闭');
                if (this.threeDOn) {
                    this.ensureThreeDCanvas();
                    this.startThreeDLoop();
                } else {
                    this.stopThreeDLoop();
                }
                this.saveControlSettings();
            });
        }
        
        if (btn3DSettings) {
            btn3DSettings.addEventListener('click', () => {
                this.threeDPanel.classList.add('active');
                this.controlPanel.classList.remove('active');
                console.log('打开3D模式详细设置');
            });
        }
        
        // 关灯模式开关
        const toggleLightsOff = document.getElementById('toggleLightsOff');
        
        if (toggleLightsOff) {
            toggleLightsOff.addEventListener('change', (e) => {
                const enabled = e.target.checked;
                this.isLightsOff = enabled;
                
                if (enabled) {
                    this.lightsOffOverlay.classList.add('active');
                    this.videoArea.classList.add('lights-off');
                    document.body.classList.add('lights-off');
                    console.log('关灯模式：开启');
                } else {
                    this.lightsOffOverlay.classList.remove('active');
                    this.videoArea.classList.remove('lights-off');
                    document.body.classList.remove('lights-off');
                    console.log('关灯模式：关闭');
                }
            });
        }
        
        // 点击外部关闭面板
        document.addEventListener('click', (e) => {
            if (this.controlPanel.classList.contains('active')) {
                if (!this.controlPanel.contains(e.target) && !this.controlMenuBtn.contains(e.target)) {
                    this.controlPanel.classList.remove('active');
                }
            }
        });
        
        console.log('控制面板初始化成功');
    }

    // ========== 播放菜单选项 ==========
    initPlaybackMenu() {
        // 播放/暂停、停止、下一个、上一个、快进、快退 已由 bindMenuOptions 事件委托统一处理，此处不再重复绑定

        // 播放效果选项
        const playbackOptions = [
            { id: 'playbackFFMPEG', value: 'ffmpeg', name: 'FFMPEG Player' },
            { id: 'playbackDirectShow', value: 'directshow', name: 'Direct Show Player' },
            { id: 'playbackQuickTime', value: 'quicktime', name: 'QuickTime Player' },
            { id: 'playbackMPlayer', value: 'mplayer', name: 'MPlayer' }
        ];
        
        playbackOptions.forEach(option => {
            const element = document.getElementById(option.id);
            if (element) {
                element.addEventListener('click', () => {
                    console.log('已选择:', option.name);
                    this.currentPlaybackCore = option.value;
                    this.updateMenuSelection(playbackOptions.map(o => o.id), option.id);
                    this.showNotification(`播放效果: ${option.name}`, 'info');
                });
            }
        });
        
        // 分离器选项
        const splitterOptions = [
            { id: 'splitterAuto', value: 'auto', name: '自动选择' },
            { id: 'splitterLAVF', value: 'lavf', name: 'LAVF Splitter' },
            { id: 'splitterHaali', value: 'haali', name: 'Haali Media Splitter' },
            { id: 'splitterMadVR', value: 'madvr', name: 'madVR Splitter' }
        ];
        
        splitterOptions.forEach(option => {
            const element = document.getElementById(option.id);
            if (element) {
                element.addEventListener('click', async () => {
                    console.log('已选择分离器:', option.name);
                    this.currentSplitter = option.value;
                    this.updateMenuSelection(splitterOptions.map(o => o.id), option.id);
                    
                    // 更新解码器配置
                    await this.updateDecoderConfig();
                    this.showNotification(`分离器: ${option.name}`, 'info');
                });
            }
        });
        
        // 视频解码器选项
        const videoDecoderOptions = [
            { id: 'videoDecoderAuto', value: 'auto', name: '自动选择' },
            { id: 'videoDecoderH264', value: 'h264', name: 'H.264/AVC Decoder' },
            { id: 'videoDecoderH265', value: 'h265', name: 'H.265/HEVC Decoder' },
            { id: 'videoDecoderFFmpeg', value: 'ffmpeg', name: 'FFmpeg Video Decoder' },
            { id: 'videoDecoderDXVA', value: 'dxva', name: 'DXVA2 Hardware Decoder' }
        ];
        
        videoDecoderOptions.forEach(option => {
            const element = document.getElementById(option.id);
            if (element) {
                element.addEventListener('click', async () => {
                    console.log('已选择视频解码器:', option.name);
                    this.currentVideoDecoder = option.value;
                    this.updateMenuSelection(videoDecoderOptions.map(o => o.id), option.id);
                    
                    // 更新解码器配置
                    await this.updateDecoderConfig();
                    
                    // 提示用户硬件加速已启用
                    if (option.value === 'dxva') {
                        this.showNotification(`视频解码器: ${option.name} (硬件加速已启用)`, 'success');
                    } else {
                        this.showNotification(`视频解码器: ${option.name}`, 'info');
                    }
                });
            }
        });
        
        // 音频解码器选项
        const audioDecoderOptions = [
            { id: 'audioDecoderAuto', value: 'auto', name: '自动选择' },
            { id: 'audioDecoderAAC', value: 'aac', name: 'AAC Audio Decoder' },
            { id: 'audioDecoderMP3', value: 'mp3', name: 'MP3 Audio Decoder' },
            { id: 'audioDecoderAC3', value: 'ac3', name: 'AC3 Audio Decoder' },
            { id: 'audioDecoderDTS', value: 'dts', name: 'DTS Audio Decoder' },
            { id: 'audioDecoderFFmpeg', value: 'ffmpeg', name: 'FFmpeg Audio Decoder' }
        ];
        
        audioDecoderOptions.forEach(option => {
            const element = document.getElementById(option.id);
            if (element) {
                element.addEventListener('click', async () => {
                    console.log('已选择音频解码器:', option.name);
                    this.currentAudioDecoder = option.value;
                    this.updateMenuSelection(audioDecoderOptions.map(o => o.id), option.id);
                    
                    // 更新解码器配置
                    await this.updateDecoderConfig();
                    this.showNotification(`音频解码器: ${option.name}`, 'info');
                });
            }
        });
        
        // 渲染器选项
        const rendererOptions = [
            { id: 'rendererAuto', value: 'auto', name: '自动选择' },
            { id: 'rendererEVR', value: 'evr', name: 'EVR (Enhanced Video Renderer)' },
            { id: 'rendererVMR9', value: 'vmr9', name: 'VMR-9 (Video Mixing Renderer)' },
            { id: 'rendererMadVR', value: 'madvr', name: 'madVR Renderer' },
            { id: 'rendererOverlay', value: 'overlay', name: 'Overlay Mixer' }
        ];
        
        rendererOptions.forEach(option => {
            const element = document.getElementById(option.id);
            if (element) {
                element.addEventListener('click', async () => {
                    console.log('已选择渲染器:', option.name);
                    this.currentRenderer = option.value;
                    this.updateMenuSelection(rendererOptions.map(o => o.id), option.id);
                    
                    // 更新解码器配置
                    await this.updateDecoderConfig();
                    
                    // 提示用户高质量渲染
                    if (option.value === 'madvr') {
                        this.showNotification(`渲染器: ${option.name} (高质量渲染)`, 'success');
                    } else {
                        this.showNotification(`渲染器: ${option.name}`, 'info');
                    }
                });
            }
        });
        
        // 初始化选中状态（默认选中"自动选择"）
        this.updateMenuSelection(playbackOptions.map(o => o.id), 'playbackFFMPEG');
        this.updateMenuSelection(splitterOptions.map(o => o.id), 'splitterAuto');
        this.updateMenuSelection(videoDecoderOptions.map(o => o.id), 'videoDecoderAuto');
        this.updateMenuSelection(audioDecoderOptions.map(o => o.id), 'audioDecoderAuto');
        this.updateMenuSelection(rendererOptions.map(o => o.id), 'rendererAuto');
        
        // 禁用的菜单选项 - 阻止点击
        const disabledMenus = document.querySelectorAll('.menu-option.disabled');
        disabledMenus.forEach(menu => {
            menu.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('此功能暂不可用');
            });
        });
        
        // 禁用的子菜单父项 - 阻止展开子菜单
        const disabledSubmenus = document.querySelectorAll('.submenu-parent.disabled');
        disabledSubmenus.forEach(menu => {
            menu.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('此功能暂不可用');
            });
        });
        
        console.log('播放菜单初始化成功');
    }
    
    // 初始化菜单交互（点击展开子菜单）
    initMenuInteraction() {
        // 获取所有带子菜单的菜单项
        const submenuParents = document.querySelectorAll('.submenu-parent');
        
        submenuParents.forEach(parent => {
            // 阻止默认的hover行为，改用点击
            let submenu = parent.querySelector('.submenu');
            if (!submenu) return;
            
            // 点击父菜单项时切换子菜单显示
            parent.addEventListener('click', (e) => {
                e.stopPropagation();
                
                // 如果是禁用的菜单，不展开
                if (parent.classList.contains('disabled')) {
                    return;
                }
                
                // 切换当前子菜单
                const isCurrentlyVisible = submenu.style.display === 'block';
                
                // 关闭所有其他子菜单
                document.querySelectorAll('.submenu').forEach(s => {
                    s.style.display = 'none';
                });
                
                // 切换当前子菜单
                if (!isCurrentlyVisible) {
                    submenu.style.display = 'block';
                } else {
                    submenu.style.display = 'none';
                }
            });
            
            // 保持hover效果作为辅助
            parent.addEventListener('mouseenter', () => {
                if (!parent.classList.contains('disabled')) {
                    submenu.style.display = 'block';
                }
            });
            
            // 鼠标离开父菜单区域时，延迟关闭（给用户时间移动到子菜单）
            let leaveTimer;
            parent.addEventListener('mouseleave', (e) => {
                leaveTimer = setTimeout(() => {
                    // 检查鼠标是否在子菜单上
                    const rect = submenu.getBoundingClientRect();
                    const mouseX = e.clientX;
                    const mouseY = e.clientY;
                    
                    if (!(mouseX >= rect.left && mouseX <= rect.right && 
                          mouseY >= rect.top && mouseY <= rect.bottom)) {
                        submenu.style.display = 'none';
                    }
                }, 200);
            });
            
            // 鼠标进入子菜单时，清除关闭定时器
            submenu.addEventListener('mouseenter', () => {
                clearTimeout(leaveTimer);
            });
            
            // 鼠标离开子菜单时关闭
            submenu.addEventListener('mouseleave', () => {
                setTimeout(() => {
                    submenu.style.display = 'none';
                }, 100);
            });
        });
        
        // 点击菜单项后关闭所有子菜单
        document.querySelectorAll('.menu-option:not(.submenu-parent)').forEach(item => {
            item.addEventListener('click', () => {
                document.querySelectorAll('.submenu').forEach(s => {
                    s.style.display = 'none';
                });
            });
        });
        
        // 点击页面其他地方关闭所有子菜单
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.submenu-parent') && !e.target.closest('.submenu')) {
                document.querySelectorAll('.submenu').forEach(s => {
                    s.style.display = 'none';
                });
            }
        });
        
        console.log('菜单交互增强初始化成功');
    }
    
    // 更新菜单选中状态
    updateMenuSelection(allIds, selectedId) {
        allIds.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                const icon = element.querySelector('.fa-check');
                if (icon) {
                    if (id === selectedId) {
                        icon.style.visibility = 'visible';
                        icon.style.color = '#4a9eff';
                    } else {
                        icon.style.visibility = 'hidden';
                    }
                }
            }
        });
    }
    
    // 更新解码器配置
    async updateDecoderConfig() {
        if (!window.electronAPI || !window.electronAPI.updateDecoderConfig) {
            console.warn('解码器API不可用');
            return;
        }
        
        const config = {
            splitter: this.currentSplitter,
            videoDecoder: this.currentVideoDecoder,
            audioDecoder: this.currentAudioDecoder,
            renderer: this.currentRenderer,
            playbackCore: this.currentPlaybackCore,
            hardwareAccel: this.currentVideoDecoder === 'dxva'
        };
        
        console.log('更新解码器配置:', config);
        
        try {
            const result = await window.electronAPI.updateDecoderConfig(config);
            if (result.success) {
                console.log('解码器配置更新成功');
            } else {
                console.error('解码器配置更新失败:', result.error);
            }
        } catch (error) {
            console.error('更新解码器配置时出错:', error);
        }
    }

    // 应用左眼样式（仅当左眼开启且非全景时生效，不影响其他功能）
    applyLeftEyeStyle() {
        if (!this.video) return;
        if (this.panoramaMode !== 'off') return;
        if (!this.leftEyeOn) {
            this.video.style.filter = '';
            this.video.style.transform = '';
            return;
        }
        const b = Math.max(30, Math.min(150, Number(this.leftEyeBrightness) || 100));
        const c = Math.max(50, Math.min(150, Number(this.leftEyeContrast) || 100));
        const angle = Number(this.leftEyeViewAngle) || 0;
        this.video.style.filter = `brightness(${b}%) contrast(${c}%)`;
        this.video.style.transform = `perspective(800px) rotateY(${angle}deg)`;
    }

    // ========== 左眼详细设置面板 ==========
    initLeftEyePanel() {
        if (!this.leftEyePanel) {
            console.error('左眼详细设置面板未找到！');
            return;
        }
        
        // 关闭按钮
        if (this.closeLeftEye) {
            console.log('左眼模式关闭按钮已绑定');
            this.closeLeftEye.addEventListener('click', (e) => {
                console.log('左眼模式关闭按钮被点击');
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                this.leftEyePanel.classList.remove('active');
            }, true);
        }
        
        // 视角调节
        const viewAngleSlider = document.getElementById('leftEyeViewAngle');
        const viewAngleValue = document.getElementById('leftEyeViewAngleValue');
        if (viewAngleSlider && viewAngleValue) {
            viewAngleSlider.addEventListener('input', (e) => {
                const value = e.target.value;
                viewAngleValue.textContent = value + '°';
                this.leftEyeViewAngle = value;
                if (this.leftEyeOn) this.applyLeftEyeStyle();
                this.saveControlSettings();
            });
        }
        
        // 亮度补偿
        const brightnessSlider = document.getElementById('leftEyeBrightness');
        const brightnessValue = document.getElementById('leftEyeBrightnessValue');
        if (brightnessSlider && brightnessValue) {
            brightnessSlider.addEventListener('input', (e) => {
                const value = e.target.value;
                brightnessValue.textContent = value + '%';
                this.leftEyeBrightness = value;
                if (this.leftEyeOn) this.applyLeftEyeStyle();
                this.saveControlSettings();
            });
        }
        
        // 对比度补偿
        const contrastSlider = document.getElementById('leftEyeContrast');
        const contrastValue = document.getElementById('leftEyeContrastValue');
        if (contrastSlider && contrastValue) {
            contrastSlider.addEventListener('input', (e) => {
                const value = e.target.value;
                contrastValue.textContent = value + '%';
                this.leftEyeContrast = value;
                if (this.leftEyeOn) this.applyLeftEyeStyle();
                this.saveControlSettings();
            });
        }
        
        // 重置按钮
        const resetBtn = document.getElementById('resetLeftEye');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                if (viewAngleSlider) {
                    viewAngleSlider.value = 0;
                    viewAngleValue.textContent = '0°';
                    this.leftEyeViewAngle = 0;
                }
                if (brightnessSlider) {
                    brightnessSlider.value = 100;
                    brightnessValue.textContent = '100%';
                    this.leftEyeBrightness = 100;
                }
                if (contrastSlider) {
                    contrastSlider.value = 100;
                    contrastValue.textContent = '100%';
                    this.leftEyeContrast = 100;
                }
                if (this.leftEyeOn) this.applyLeftEyeStyle();
                this.saveControlSettings();
                console.log('左眼设置已重置');
            });
        }
        
        console.log('左眼详细设置面板初始化成功');
    }

    // ========== 环绕声详细设置面板 ==========
    initSurroundSoundPanel() {
        if (!this.surroundSoundPanel) {
            console.error('环绕声详细设置面板未找到！');
            return;
        }
        
        // 关闭按钮
        if (this.closeSurroundSound) {
            console.log('环绕声模式关闭按钮已绑定');
            this.closeSurroundSound.addEventListener('click', (e) => {
                console.log('环绕声模式关闭按钮被点击');
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                this.surroundSoundPanel.classList.remove('active');
            }, true);
        }
        
        // 环绕声模式
        const surroundModeRadios = document.querySelectorAll('input[name="surroundMode"]');
        surroundModeRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.surroundMode = e.target.value;
                console.log('环绕声模式:', this.surroundMode);
                this.applySurroundParams();
                this.saveControlSettings();
            });
        });
        
        // 环绕声强度
        const intensitySlider = document.getElementById('surroundIntensity');
        const intensityValue = document.getElementById('surroundIntensityValue');
        if (intensitySlider && intensityValue) {
            intensitySlider.addEventListener('input', (e) => {
                const value = e.target.value;
                intensityValue.textContent = value + '%';
                this.surroundIntensity = value;
                this.applySurroundParams();
                this.saveControlSettings();
            });
        }
        
        // 低音增强
        const bassBoostSlider = document.getElementById('bassBoost');
        const bassBoostValue = document.getElementById('bassBoostValue');
        if (bassBoostSlider && bassBoostValue) {
            bassBoostSlider.addEventListener('input', (e) => {
                const value = e.target.value;
                bassBoostValue.textContent = value + '%';
                this.surroundBass = value;
                this.applySurroundParams();
                this.saveControlSettings();
            });
        }
        
        // 重置按钮
        const resetBtn = document.getElementById('resetSurroundSound');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                const offRadio = document.querySelector('input[name="surroundMode"][value="off"]');
                if (offRadio) offRadio.checked = true;
                this.surroundMode = 'off';
                if (intensitySlider) {
                    intensitySlider.value = 50;
                    intensityValue.textContent = '50%';
                }
                if (bassBoostSlider) {
                    bassBoostSlider.value = 0;
                    bassBoostValue.textContent = '0%';
                }
                this.surroundIntensity = 50;
                this.surroundBass = 0;
                this.applySurroundParams();
                this.saveControlSettings();
                console.log('环绕声设置已重置');
            });
        }
        
        console.log('环绕声详细设置面板初始化成功');
    }

    // ========== 3D详细设置面板 ==========
    initThreeDPanel() {
        if (!this.threeDPanel) {
            console.error('3D详细设置面板未找到！');
            return;
        }
        
        // 关闭按钮
        if (this.closeThreeD) {
            console.log('3D模式关闭按钮已绑定');
            this.closeThreeD.addEventListener('click', (e) => {
                console.log('3D模式关闭按钮被点击');
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                this.threeDPanel.classList.remove('active');
            }, true);
        }
        
        // 3D模式
        const threeDModeRadios = document.querySelectorAll('input[name="threeDMode"]');
        threeDModeRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.threeDMode = e.target.value;
                console.log('3D模式:', this.threeDMode);
                this.saveControlSettings();
            });
        });
        
        // 深度调节
        const depthSlider = document.getElementById('threeDDepth');
        const depthValue = document.getElementById('threeDDepthValue');
        if (depthSlider && depthValue) {
            depthSlider.addEventListener('input', (e) => {
                const value = e.target.value;
                depthValue.textContent = value + '%';
                this.threeDDepth = value;
                this.saveControlSettings();
            });
        }
        
        // 眼距调节
        const eyeDistSlider = document.getElementById('eyeDistance');
        const eyeDistValue = document.getElementById('eyeDistanceValue');
        if (eyeDistSlider && eyeDistValue) {
            eyeDistSlider.addEventListener('input', (e) => {
                const value = e.target.value;
                eyeDistValue.textContent = value;
                this.eyeDistance = Number(value) || 0;
                this.saveControlSettings();
            });
        }
        
        // 重置按钮
        const resetBtn = document.getElementById('resetThreeD');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                const offRadio = document.querySelector('input[name="threeDMode"][value="off"]');
                if (offRadio) offRadio.checked = true;
                if (depthSlider) {
                    depthSlider.value = 50;
                    depthValue.textContent = '50%';
                }
                if (eyeDistSlider) {
                    eyeDistSlider.value = 0;
                    eyeDistValue.textContent = '0';
                }
                this.threeDDepth = 50;
                this.eyeDistance = 0;
                this.saveControlSettings();
                console.log('3D设置已重置');
            });
        }
        
        console.log('3D详细设置面板初始化成功');
    }

    // 3D 渲染：仅当 3D 开启且非全景时使用 canvas，不影响其他功能
    ensureThreeDCanvas() {
        if (!this.videoArea || !this.video) return;
        if (this.threeDCanvas) return;
        const canvas = document.createElement('canvas');
        canvas.id = 'threeDCanvas';
        canvas.className = 'three-d-canvas';
        canvas.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;object-fit:contain;pointer-events:none;z-index:2;';
        this.videoArea.appendChild(canvas);
        this.threeDCanvas = canvas;
        this.threeDCtx = canvas.getContext('2d');
    }

    startThreeDLoop() {
        if (this.threeDAnimationId) return;
        const loop = () => {
            if (!this.threeDOn || this.panoramaMode !== 'off' || !this.threeDCanvas || !this.threeDCtx || !this.video || !this.video.src) {
                this.stopThreeDLoop();
                return;
            }
            if (this.threeDMode === 'off') {
                this.threeDCanvas.style.display = 'none';
                this.video.style.visibility = '';
                this.threeDAnimationId = requestAnimationFrame(loop);
                return;
            }
            this.video.style.visibility = 'hidden';
            this.threeDCanvas.style.display = 'block';
            this.renderThreeDFrame();
            this.threeDAnimationId = requestAnimationFrame(loop);
        };
        loop();
    }

    stopThreeDLoop() {
        if (this.threeDAnimationId) {
            cancelAnimationFrame(this.threeDAnimationId);
            this.threeDAnimationId = null;
        }
        if (this.video) this.video.style.visibility = '';
        if (this.threeDCanvas) this.threeDCanvas.style.display = 'none';
    }

    renderThreeDFrame() {
        const canvas = this.threeDCanvas;
        const ctx = this.threeDCtx;
        const video = this.video;
        if (!canvas || !ctx || !video || video.readyState < 2) return;
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        if (vw === 0 || vh === 0) return;
        const rect = this.videoArea.getBoundingClientRect();
        if (canvas.width !== rect.width) canvas.width = rect.width;
        if (canvas.height !== rect.height) canvas.height = rect.height;
        const cw = canvas.width;
        const ch = canvas.height;
        const mode = this.threeDMode;
        const depth = (Number(this.threeDDepth) || 50) / 100 * 30;
        const eyeDist = Math.max(-1, Math.min(1, (Number(this.eyeDistance) || 0) / 100));

        if (mode === 'anaglyph') {
            const offset = Math.round(depth);
            const tmp = document.createElement('canvas');
            tmp.width = vw;
            tmp.height = vh;
            const tctx = tmp.getContext('2d');
            tctx.drawImage(video, 0, 0, vw, vh);
            const img = tctx.getImageData(0, 0, vw, vh);
            const data = img.data;
            const out = ctx.createImageData(vw, vh);
            const od = out.data;
            for (let y = 0; y < vh; y++) {
                for (let x = 0; x < vw; x++) {
                    const i = (y * vw + x) * 4;
                    const xL = Math.max(0, Math.min(vw - 1, x + offset));
                    const xR = Math.max(0, Math.min(vw - 1, x - offset));
                    const jL = (y * vw + xL) * 4;
                    const jR = (y * vw + xR) * 4;
                    od[i] = data[jL];
                    od[i + 1] = data[jR + 1];
                    od[i + 2] = data[jR + 2];
                    od[i + 3] = 255;
                }
            }
            tctx.putImageData(out, 0, 0);
            ctx.drawImage(tmp, 0, 0, vw, vh, 0, 0, cw, ch);
            return;
        }

        if (mode === 'sbs') {
            const half = vw / 2;
            const halfW = cw / 2;
            ctx.drawImage(video, 0, 0, half, vh, 0, 0, halfW, ch);
            ctx.drawImage(video, half, 0, half, vh, halfW, 0, halfW, ch);
            return;
        }

        if (mode === 'tb') {
            const half = vh / 2;
            const halfH = ch / 2;
            ctx.drawImage(video, 0, 0, vw, half, 0, 0, cw, halfH);
            ctx.drawImage(video, 0, half, vw, half, 0, halfH, cw, halfH);
            return;
        }

        ctx.drawImage(video, 0, 0, vw, vh, 0, 0, cw, ch);
    }

    // ========== 字幕设置 ==========
    initSubtitleSettings() {
        if (!this.subtitleSettingsPanel) {
            console.error('字幕设置面板未找到！');
            return;
        }
        
        // 获取字幕轨道元素
        this.mainSubtitleTrack = document.getElementById('mainSubtitleTrack');
        this.secondarySubtitleTrack = document.getElementById('secondarySubtitleTrack');
        this.subtitleSelect = document.getElementById('subtitleSelect');
        
        // 字幕菜单按钮 - 打开字幕面板
        if (this.subtitleMenuBtn) {
            this.subtitleMenuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.subtitleSettingsPanel.classList.toggle('active');
            });
        }
        
        // 关闭字幕面板
        if (this.closeSubtitlePanel) {
            this.closeSubtitlePanel.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.subtitleSettingsPanel.classList.remove('active');
            });
        }
        
        // 标签页切换
        const subtitleTabs = document.querySelectorAll('.subtitle-tab');
        subtitleTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                subtitleTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.currentSubtitleTab = tab.dataset.tab;
                this.updateSubtitleSelectList();
                this.updateSubtitleControlsUI(); // 更新UI显示当前字幕的配置
                console.log('切换到', tab.textContent, '标签页');
            });
        });
        
        // 开启次字幕复选框
        const enableSecondaryMain = document.getElementById('enableSecondarySubtitleMain');
        if (enableSecondaryMain) {
            enableSecondaryMain.addEventListener('change', (e) => {
                this.secondarySubtitleEnabled = e.target.checked;
                
                if (this.secondarySubtitleEnabled) {
                    // 启用次字幕轨道
                    if (this.secondarySubtitleTrack) {
                        this.secondarySubtitleTrack.track.mode = 'showing';
                    }
                    console.log('次字幕已开启');
                } else {
                    // 禁用次字幕轨道
                    if (this.secondarySubtitleTrack) {
                        this.secondarySubtitleTrack.track.mode = 'hidden';
                    }
                    console.log('次字幕已关闭');
                }
            });
        }
        
        // 字幕选择下拉框
        if (this.subtitleSelect) {
            this.subtitleSelect.addEventListener('change', (e) => {
                const value = e.target.value;
                
                if (value === 'hide') {
                    // 隐藏字幕
                    this.hideSubtitle();
                } else {
                    // 切换到选中的字幕
                    const index = parseInt(value);
                    if (!isNaN(index)) {
                        this.switchSubtitle(index);
                    }
                }
            });
        }
        
        // 载入字幕按钮
        const btnLoadSubtitle = document.getElementById('btnLoadSubtitle');
        if (btnLoadSubtitle) {
            btnLoadSubtitle.addEventListener('click', () => {
                this.loadSubtitleFile();
            });
        }
        
        // 字体选择
        const fontFamily = document.getElementById('subtitleFontFamily');
        if (fontFamily) {
            fontFamily.addEventListener('change', (e) => {
                if (e.target.disabled) return;
                const currentStyle = this.getCurrentSubtitleStyle();
                currentStyle.fontFamily = e.target.value;
                console.log('字体:', e.target.value);
                // 实时更新字幕样式
                this.reloadCurrentSubtitleWithStyle();
            });
        }
        
        // 字号选择
        const fontSize = document.getElementById('subtitleFontSize');
        if (fontSize) {
            fontSize.addEventListener('change', (e) => {
                if (e.target.disabled) return;
                const currentStyle = this.getCurrentSubtitleStyle();
                // 确保是数字字符串，然后添加px单位
                const fontSizeValue = parseInt(e.target.value);
                if (!isNaN(fontSizeValue)) {
                    currentStyle.fontSize = fontSizeValue + 'px';
                    console.log('字号已更改:', fontSizeValue + 'px', '当前标签:', this.currentSubtitleTab);
                    // 实时更新字幕样式
                    this.reloadCurrentSubtitleWithStyle();
                } else {
                    console.error('无效的字号值:', e.target.value);
                }
            });
        }
        
        // 文字格式按钮 - 打开颜色选择器
        const btnTextFormat = document.getElementById('btnTextFormat');
        if (btnTextFormat) {
            btnTextFormat.addEventListener('click', (e) => {
                if (e.target.disabled) return;
                console.log('打开文字格式设置');
                this.openSubtitleColorPicker();
            });
        }
        
        // 字幕同步
        const delayMinus = document.getElementById('subtitleDelayMinus100');
        const delayPlus = document.getElementById('subtitleDelayPlus100');
        const syncValue = document.getElementById('subtitleSyncValue');
        
        if (delayMinus && syncValue) {
            delayMinus.addEventListener('click', (e) => {
                if (e.target.disabled) return;
                if (this.currentSubtitleTab === 'main') {
                    this.subtitleDelay -= 100;
                    syncValue.value = this.subtitleDelay + '毫秒';
                    console.log('主字幕延迟:', this.subtitleDelay);
                } else {
                    this.secondarySubtitleDelay -= 100;
                    syncValue.value = this.secondarySubtitleDelay + '毫秒';
                    console.log('次字幕延迟:', this.secondarySubtitleDelay);
                }
                this.applySubtitleSync();
            });
        }
        
        if (delayPlus && syncValue) {
            delayPlus.addEventListener('click', (e) => {
                if (e.target.disabled) return;
                if (this.currentSubtitleTab === 'main') {
                    this.subtitleDelay += 100;
                    syncValue.value = this.subtitleDelay + '毫秒';
                    console.log('主字幕延迟:', this.subtitleDelay);
                } else {
                    this.secondarySubtitleDelay += 100;
                    syncValue.value = this.secondarySubtitleDelay + '毫秒';
                    console.log('次字幕延迟:', this.secondarySubtitleDelay);
                }
                this.applySubtitleSync();
            });
        }
        
        const resetSync = document.getElementById('resetSubtitleSync');
        if (resetSync && syncValue) {
            resetSync.addEventListener('click', (e) => {
                if (e.target.disabled) return;
                if (this.currentSubtitleTab === 'main') {
                    this.subtitleDelay = 0;
                    syncValue.value = '0毫秒';
                    console.log('主字幕同步已重置');
                } else {
                    this.secondarySubtitleDelay = 0;
                    syncValue.value = '0毫秒';
                    console.log('次字幕同步已重置');
                }
                this.applySubtitleSync();
            });
        }
        
        // 字幕位置
        const posButtons = {
            up: document.getElementById('subPosUp'),
            down: document.getElementById('subPosDown'),
            left: document.getElementById('subPosLeft'),
            right: document.getElementById('subPosRight')
        };
        
        Object.entries(posButtons).forEach(([dir, btn]) => {
            if (btn) {
                btn.addEventListener('click', (e) => {
                    if (e.target.disabled) return;
                    const currentStyle = this.getCurrentSubtitleStyle();
                    const step = 5; // 每次移动5像素
                    switch(dir) {
                        case 'up':
                            currentStyle.position.y -= step;
                            break;
                        case 'down':
                            currentStyle.position.y += step;
                            break;
                        case 'left':
                            currentStyle.position.x -= step;
                            break;
                        case 'right':
                            currentStyle.position.x += step;
                            break;
                    }
                    console.log('字幕位置:', dir, currentStyle.position);
                    this.applySubtitleStyle();
                });
            }
        });
        
        const resetPos = document.getElementById('resetSubPosition');
        if (resetPos) {
            resetPos.addEventListener('click', (e) => {
                if (e.target.disabled) return;
                const currentStyle = this.getCurrentSubtitleStyle();
                currentStyle.position = { x: 0, y: 0 };
                console.log('字幕位置已重置');
                this.applySubtitleStyle();
            });
        }
        
        // 点击外部关闭面板
        document.addEventListener('click', (e) => {
            if (this.subtitleSettingsPanel.classList.contains('active')) {
                const colorPicker = document.getElementById('subtitleColorPicker');
                const isClickInsideColorPicker = colorPicker && colorPicker.contains(e.target);
                const isClickInsidePanel = this.subtitleSettingsPanel.contains(e.target);
                const isClickOnMenuBtn = this.subtitleMenuBtn.contains(e.target);
                
                // 如果点击在颜色选择器、字幕面板或菜单按钮内，则不关闭
                if (!isClickInsidePanel && !isClickOnMenuBtn && !isClickInsideColorPicker) {
                    this.subtitleSettingsPanel.classList.remove('active');
                }
            }
        });
        
        // 初始化颜色选择器
        this.initColorPicker();
        
        console.log('字幕设置初始化成功');
    }
    
    loadSubtitleFile() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.srt,.vtt,.ass,.ssa,.sub';
        
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const fileName = file.name;
            const fileExt = fileName.split('.').pop().toLowerCase();
            
            // 读取字幕文件内容
            const reader = new FileReader();
            reader.onload = (event) => {
                const content = event.target.result;
                let vttContent;
                
                // 如果是SRT格式，转换为VTT
                if (fileExt === 'srt') {
                    vttContent = this.convertSRTtoVTT(content);
                } else if (fileExt === 'vtt') {
                    vttContent = content;
                } else {
                    // 其他格式尝试作为VTT处理
                    vttContent = 'WEBVTT\n\n' + content;
                }
                
                // 为主次字幕添加不同的样式标记
                const styledVttContent = this.addSubtitleStyleClass(vttContent, this.currentSubtitleTab);
                
                // 创建VTT blob
                const blob = new Blob([styledVttContent], { type: 'text/vtt' });
                const url = URL.createObjectURL(blob);
                
                // 根据当前标签页添加到对应列表
                const subtitleInfo = {
                    file: file,
                    url: url,
                    name: fileName,
                    content: vttContent,  // 保存原始内容，用于同步调整
                    originalContent: vttContent
                };
                
                if (this.currentSubtitleTab === 'main') {
                    // 添加到主字幕
                    this.subtitleFiles.push(subtitleInfo);
                    const index = this.subtitleFiles.length - 1;
                    this.addSubtitleToList(subtitleInfo, index);
                    this.applySubtitle(url, 'main');
                    this.currentSubtitle = index; // 记录当前选中的主字幕
                    console.log(`已载入主字幕: ${fileName}`);
                    this.showNotification(`已载入主字幕: ${fileName}`, 'success');
                } else {
                    // 添加到次字幕
                    this.secondarySubtitleFiles.push(subtitleInfo);
                    const index = this.secondarySubtitleFiles.length - 1;
                    this.addSubtitleToList(subtitleInfo, index);
                    this.currentSecondarySubtitle = index; // 记录当前选中的次字幕
                    
                    // 加载次字幕后自动启用并显示
                    this.secondarySubtitleEnabled = true;
                    const enableSecondaryCheckbox = document.getElementById('enableSecondarySubtitleMain');
                    if (enableSecondaryCheckbox) {
                        enableSecondaryCheckbox.checked = true;
                    }
                    
                    // 应用次字幕
                    this.applySubtitle(url, 'secondary');
                    
                    console.log(`已载入次字幕: ${fileName}`);
                    this.showNotification(`已载入次字幕: ${fileName}`, 'success');
                }
                
                // 启用字幕控件
                this.enableSubtitleControls();
            };
            
            reader.readAsText(file, 'UTF-8');
        };
        
        input.click();
    }
    
    // SRT转VTT格式
    convertSRTtoVTT(srtContent) {
        let vttContent = 'WEBVTT\n\n';
        
        // 将SRT时间格式转换为VTT格式
        // SRT: 00:00:01,000 --> 00:00:04,000
        // VTT: 00:00:01.000 --> 00:00:04.000
        vttContent += srtContent.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
        
        return vttContent;
    }
    
    // 为字幕内容添加样式类标记（用于主次字幕独立样式）
    addSubtitleStyleClass(vttContent, type) {
        const className = type === 'main' ? 'main-sub' : 'secondary-sub';
        const lines = vttContent.split('\n');
        const result = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // 检查是否为时间码行
            const isTimeline = /^\d{2}:\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}/.test(line);
            
            // 检查是否为空行、WEBVTT标记或注释
            const isControlLine = line.trim() === '' || 
                                  line.startsWith('WEBVTT') || 
                                  line.startsWith('NOTE') ||
                                  /^\d+$/.test(line.trim()); // 序号行
            
            if (isTimeline || isControlLine) {
                // 时间码、空行、标记、序号行不修改
                result.push(line);
            } else if (line.trim() !== '') {
                // 字幕文本行，添加样式类包裹
                result.push(`<c.${className}>${line}</c>`);
            } else {
                result.push(line);
            }
        }
        
        return result.join('\n');
    }
    
    // 添加字幕到列表
    addSubtitleToList(subtitleInfo, index) {
        if (!this.subtitleSelect) return;
        
        // 处理文件名
        let displayName = subtitleInfo.name;
        if (displayName.length > 20) {
            displayName = displayName.substring(0, 20) + '...';
        }
        
        const option = document.createElement('option');
        option.value = index;
        option.textContent = displayName;
        option.title = subtitleInfo.name; // 完整名称作为提示
        
        this.subtitleSelect.appendChild(option);
        
        // 自动选中新添加的字幕
        this.subtitleSelect.value = index;
    }
    
    // 更新字幕选择列表
    updateSubtitleSelectList() {
        if (!this.subtitleSelect) return;
        
        // 保存当前选中的值
        const currentSelected = this.currentSubtitleTab === 'main' ? 
            this.currentSubtitle : this.currentSecondarySubtitle;
        
        // 清空现有选项
        this.subtitleSelect.innerHTML = '<option value="hide">隐藏字幕</option>';
        
        // 根据当前标签页显示对应的字幕列表
        const subtitleList = this.currentSubtitleTab === 'main' ? 
            this.subtitleFiles : this.secondarySubtitleFiles;
        
        subtitleList.forEach((subtitleInfo, index) => {
            let displayName = subtitleInfo.name;
            if (displayName.length > 20) {
                displayName = displayName.substring(0, 20) + '...';
            }
            
            const option = document.createElement('option');
            option.value = index;
            option.textContent = displayName;
            option.title = subtitleInfo.name;
            
            this.subtitleSelect.appendChild(option);
        });
        
        // 恢复之前选中的字幕
        if (currentSelected !== null && currentSelected >= 0 && currentSelected < subtitleList.length) {
            this.subtitleSelect.value = currentSelected;
        } else {
            this.subtitleSelect.value = 'hide';
        }
    }
    
    // 应用字幕到视频
    applySubtitle(url, type = 'main') {
        const track = type === 'main' ? this.mainSubtitleTrack : this.secondarySubtitleTrack;
        
        if (!track) {
            console.error(`${type}字幕轨道未找到`);
            return;
        }
        
        // 设置字幕源并强制重新加载
        track.src = url;
        
        // 等待track加载完成后显示并应用样式
        track.addEventListener('load', () => {
            track.track.mode = 'showing';
            console.log(`${type}字幕轨道已加载并显示`);
            
            // 应用对应字幕的样式和位置
            setTimeout(() => {
                if (type === 'main') {
                    this.applyMainSubtitleStyle();
                } else {
                    this.applySecondarySubtitleStyle();
                }
                
                // 监听字幕变化，每次切换字幕时重新应用对应字幕的位置
                if (track.track) {
                    // 移除旧的监听器（如果有）
                    track.track.removeEventListener('cuechange', track._cuechangeHandler);
                    
                    // 创建新的监听器
                    track._cuechangeHandler = () => {
                        this.applySubtitlePosition(type);
                    };
                    track.track.addEventListener('cuechange', track._cuechangeHandler);
                }
            }, 100);
        }, { once: true });
        
        // 立即设置mode为showing
        if (track.track) {
            track.track.mode = 'showing';
        }
        
        // 启用video的字幕显示
        if (this.video.textTracks && this.video.textTracks.length > 0) {
            const trackIndex = type === 'main' ? 0 : 1;
            if (this.video.textTracks[trackIndex]) {
                this.video.textTracks[trackIndex].mode = 'showing';
            }
        }
        
        console.log(`${type}字幕已应用:`, url);
    }
    
    // 切换字幕
    switchSubtitle(index) {
        const subtitleList = this.currentSubtitleTab === 'main' ? 
            this.subtitleFiles : this.secondarySubtitleFiles;
        
        if (index < 0 || index >= subtitleList.length) {
            console.warn('无效的字幕索引');
            return;
        }
        
        const subtitleInfo = subtitleList[index];
        this.applySubtitle(subtitleInfo.url, this.currentSubtitleTab);
        
        // 记录当前选中的字幕索引
        if (this.currentSubtitleTab === 'main') {
            this.currentSubtitle = index;
        } else {
            this.currentSecondarySubtitle = index;
        }
        
        console.log(`已切换到${this.currentSubtitleTab === 'main' ? '主' : '次'}字幕: ${subtitleInfo.name}`);
    }
    
    // 隐藏字幕
    hideSubtitle() {
        const track = this.currentSubtitleTab === 'main' ? 
            this.mainSubtitleTrack : this.secondarySubtitleTrack;
        
        if (track && track.track) {
            track.track.mode = 'hidden';
        }
        
        // 记录隐藏状态
        if (this.currentSubtitleTab === 'main') {
            this.currentSubtitle = null;
        } else {
            this.currentSecondarySubtitle = null;
        }
        
        console.log(`${this.currentSubtitleTab === 'main' ? '主' : '次'}字幕已隐藏`);
    }
    
    // 启用字幕控制功能（加载字幕后调用）
    enableSubtitleControls() {
        // 启用字幕样式控件
        const fontFamily = document.getElementById('subtitleFontFamily');
        const fontSize = document.getElementById('subtitleFontSize');
        const btnTextFormat = document.getElementById('btnTextFormat');
        
        const currentStyle = this.getCurrentSubtitleStyle();
        
        if (fontFamily) {
            fontFamily.disabled = false;
            // 设置当前选中值
            const currentFont = currentStyle.fontFamily;
            for (let option of fontFamily.options) {
                if (option.value === currentFont) {
                    fontFamily.value = currentFont;
                    break;
                }
            }
        }
        
        if (fontSize) {
            fontSize.disabled = false;
            // 设置当前选中值
            const currentSize = parseInt(currentStyle.fontSize);
            fontSize.value = currentSize.toString();
        }
        
        if (btnTextFormat) btnTextFormat.disabled = false;
        
        // 启用字幕同步控件
        const delayMinus = document.getElementById('subtitleDelayMinus100');
        const delayPlus = document.getElementById('subtitleDelayPlus100');
        const resetSync = document.getElementById('resetSubtitleSync');
        
        if (delayMinus) delayMinus.disabled = false;
        if (delayPlus) delayPlus.disabled = false;
        if (resetSync) resetSync.disabled = false;
        
        // 启用字幕位置控件
        const posUp = document.getElementById('subPosUp');
        const posDown = document.getElementById('subPosDown');
        const posLeft = document.getElementById('subPosLeft');
        const posRight = document.getElementById('subPosRight');
        const resetPos = document.getElementById('resetSubPosition');
        
        if (posUp) posUp.disabled = false;
        if (posDown) posDown.disabled = false;
        if (posLeft) posLeft.disabled = false;
        if (posRight) posRight.disabled = false;
        if (resetPos) resetPos.disabled = false;
        
        console.log('字幕控制功能已启用');
    }
    
    // 获取当前活动的字幕样式对象
    getCurrentSubtitleStyle() {
        return this.currentSubtitleTab === 'main' ? 
            this.mainSubtitleStyle : this.secondarySubtitleStyle;
    }
    
    // 更新UI显示当前字幕的配置
    updateSubtitleControlsUI() {
        const currentStyle = this.getCurrentSubtitleStyle();
        const currentDelay = this.currentSubtitleTab === 'main' ? 
            this.subtitleDelay : this.secondarySubtitleDelay;
        
        // 更新字体选择器
        const fontFamily = document.getElementById('subtitleFontFamily');
        if (fontFamily && !fontFamily.disabled) {
            fontFamily.value = currentStyle.fontFamily;
        }
        
        // 更新字号选择器
        const fontSize = document.getElementById('subtitleFontSize');
        if (fontSize && !fontSize.disabled) {
            fontSize.value = parseInt(currentStyle.fontSize).toString();
        }
        
        // 更新同步延迟显示
        const syncValue = document.getElementById('subtitleSyncValue');
        if (syncValue) {
            syncValue.value = currentDelay + '毫秒';
        }
        
        console.log(`已切换到${this.currentSubtitleTab === 'main' ? '主' : '次'}字幕控制`);
    }
    
    // 禁用字幕控制功能（预留，清除字幕时调用）
    disableSubtitleControls() {
        // 禁用字幕样式控件
        const fontFamily = document.getElementById('subtitleFontFamily');
        const fontSize = document.getElementById('subtitleFontSize');
        const btnTextFormat = document.getElementById('btnTextFormat');
        
        if (fontFamily) fontFamily.disabled = true;
        if (fontSize) fontSize.disabled = true;
        if (btnTextFormat) btnTextFormat.disabled = true;
        
        // 禁用字幕同步控件
        const delayMinus = document.getElementById('subtitleDelayMinus100');
        const delayPlus = document.getElementById('subtitleDelayPlus100');
        const resetSync = document.getElementById('resetSubtitleSync');
        
        if (delayMinus) delayMinus.disabled = true;
        if (delayPlus) delayPlus.disabled = true;
        if (resetSync) resetSync.disabled = true;
        
        // 禁用字幕位置控件
        const posUp = document.getElementById('subPosUp');
        const posDown = document.getElementById('subPosDown');
        const posLeft = document.getElementById('subPosLeft');
        const posRight = document.getElementById('subPosRight');
        const resetPos = document.getElementById('resetSubPosition');
        
        if (posUp) posUp.disabled = true;
        if (posDown) posDown.disabled = true;
        if (posLeft) posLeft.disabled = true;
        if (posRight) posRight.disabled = true;
        if (resetPos) resetPos.disabled = true;
        
        console.log('字幕控制功能已禁用');
    }
    
    
    // 应用字幕样式
    applySubtitleStyle() {
        // 根据当前标签页，只应用对应字幕的样式
        if (this.currentSubtitleTab === 'main') {
            this.applyMainSubtitleStyle();
        } else {
            this.applySecondarySubtitleStyle();
        }
    }
    
    // 应用主字幕样式
    applyMainSubtitleStyle() {
        if (!this.mainSubtitleTrack || !this.mainSubtitleTrack.track) {
            console.warn('主字幕轨道未找到');
            return;
        }
        
        const { fontFamily, fontSize, color, backgroundColor } = this.mainSubtitleStyle;
        
        // 为主字幕创建独立的CSS规则（通过.main-sub类选择器）
        // 先移除旧的样式元素以确保样式刷新
        let styleElement = document.getElementById('main-subtitle-style');
        if (styleElement) {
            styleElement.remove();
        }
        
        // 创建新的样式元素
        styleElement = document.createElement('style');
        styleElement.id = 'main-subtitle-style';
        document.head.appendChild(styleElement);
        
        // 确保fontSize是正确的数值
        const fontSizeValue = parseInt(fontSize) || 25;
        
        styleElement.textContent = `
            video::cue(.main-sub) {
                font-family: ${fontFamily}, sans-serif !important;
                font-size: ${fontSizeValue}px !important;
                color: ${color} !important;
                background-color: ${backgroundColor} !important;
            }
        `;
        
        // 应用主字幕位置
        this.applySubtitlePosition('main');
        
        console.log('主字幕样式已应用:', this.mainSubtitleStyle, '实际字号:', fontSizeValue + 'px');
    }
    
    // 应用次字幕样式
    applySecondarySubtitleStyle() {
        if (!this.secondarySubtitleTrack || !this.secondarySubtitleTrack.track) {
            console.warn('次字幕轨道未找到');
            return;
        }
        
        const { fontFamily, fontSize, color, backgroundColor } = this.secondarySubtitleStyle;
        
        // 为次字幕创建独立的CSS规则（通过.secondary-sub类选择器）
        // 先移除旧的样式元素以确保样式刷新
        let styleElement = document.getElementById('secondary-subtitle-style');
        if (styleElement) {
            styleElement.remove();
        }
        
        // 创建新的样式元素
        styleElement = document.createElement('style');
        styleElement.id = 'secondary-subtitle-style';
        document.head.appendChild(styleElement);
        
        // 确保fontSize是正确的数值
        const fontSizeValue = parseInt(fontSize) || 25;
        
        styleElement.textContent = `
            video::cue(.secondary-sub) {
                font-family: ${fontFamily}, sans-serif !important;
                font-size: ${fontSizeValue}px !important;
                color: ${color} !important;
                background-color: ${backgroundColor} !important;
            }
        `;
        
        // 应用次字幕位置
        this.applySubtitlePosition('secondary');
        
        console.log('次字幕样式已应用:', this.secondarySubtitleStyle, '实际字号:', fontSizeValue + 'px');
    }
    
    // 实时重新加载当前字幕并应用样式（用于字体、大小、颜色等即时更新）
    reloadCurrentSubtitleWithStyle() {
        if (this.currentSubtitleTab === 'main') {
            // 重新加载主字幕
            if (this.currentSubtitle !== null && this.subtitleFiles[this.currentSubtitle]) {
                const subtitleInfo = this.subtitleFiles[this.currentSubtitle];
                
                // 获取原始内容或当前内容
                const originalContent = subtitleInfo.originalContent || subtitleInfo.content;
                
                // 应用当前的延迟
                let finalContent = originalContent;
                if (this.subtitleDelay !== 0) {
                    finalContent = this.applyDelayToSubtitle(originalContent, this.subtitleDelay);
                }
                
                // 添加样式类
                const styledContent = this.addSubtitleStyleClass(finalContent, 'main');
                
                // 创建新的blob URL
                const blob = new Blob([styledContent], { type: 'text/vtt' });
                const url = URL.createObjectURL(blob);
                
                // 更新存储的URL
                subtitleInfo.url = url;
                
                // 重新应用主字幕
                this.applySubtitle(url, 'main');
                
                console.log('主字幕已实时更新');
            }
        } else {
            // 重新加载次字幕
            if (this.currentSecondarySubtitle !== null && this.secondarySubtitleFiles[this.currentSecondarySubtitle]) {
                const subtitleInfo = this.secondarySubtitleFiles[this.currentSecondarySubtitle];
                
                // 获取原始内容或当前内容
                const originalContent = subtitleInfo.originalContent || subtitleInfo.content;
                
                // 应用当前的延迟
                let finalContent = originalContent;
                if (this.secondarySubtitleDelay !== 0) {
                    finalContent = this.applyDelayToSubtitle(originalContent, this.secondarySubtitleDelay);
                }
                
                // 添加样式类
                const styledContent = this.addSubtitleStyleClass(finalContent, 'secondary');
                
                // 创建新的blob URL
                const blob = new Blob([styledContent], { type: 'text/vtt' });
                const url = URL.createObjectURL(blob);
                
                // 更新存储的URL
                subtitleInfo.url = url;
                
                // 重新应用次字幕
                this.applySubtitle(url, 'secondary');
                
                console.log('次字幕已实时更新');
            }
        }
    }
    
    // 应用字幕位置偏移
    applySubtitlePosition(type = null) {
        // 如果没有指定类型，使用当前标签页
        const targetType = type || this.currentSubtitleTab;
        
        if (targetType === 'main') {
            // 应用到主字幕轨道
            const { position } = this.mainSubtitleStyle;
            if (this.mainSubtitleTrack && this.mainSubtitleTrack.track) {
                const track = this.mainSubtitleTrack.track;
                if (track.cues && track.cues.length > 0) {
                    for (let i = 0; i < track.cues.length; i++) {
                        const cue = track.cues[i];
                        // 设置垂直位置（line）：使用百分比定位
                        // line: 0=顶部, 100=底部, 85=默认位置（靠近底部）
                        // 向上按钮使 y 变负，85+(-5)=80，字幕上移
                        // 向下按钮使 y 变正，85+(5)=90，字幕下移
                        cue.line = 85 + position.y;
                        cue.snapToLines = false; // 使用百分比定位
                        
                        // 设置水平位置（position）：0-100的百分比
                        // position: 0=左边, 100=右边, 50=默认居中
                        // 向左按钮使 x 变负，50+(-5)=45，字幕左移
                        // 向右按钮使 x 变正，50+(5)=55，字幕右移
                        cue.position = 50 + position.x;
                        cue.align = 'center'; // 保持居中对齐
                        cue.positionAlign = 'center'; // 位置对齐方式
                    }
                    console.log(`主字幕位置已应用: line=${85 + position.y}, position=${50 + position.x}, cues数量=${track.cues.length}`);
                } else {
                    console.warn('主字幕轨道没有cues');
                }
            }
        } else {
            // 应用到次字幕轨道
            const { position } = this.secondarySubtitleStyle;
            if (this.secondarySubtitleTrack && this.secondarySubtitleTrack.track) {
                const track = this.secondarySubtitleTrack.track;
                if (track.cues && track.cues.length > 0) {
                    for (let i = 0; i < track.cues.length; i++) {
                        const cue = track.cues[i];
                        // 次字幕显示在主字幕上方（line值更小，更靠近顶部）
                        cue.line = 70 + position.y;  // 改为70，增加与主字幕的间距
                        cue.snapToLines = false;
                        cue.position = 50 + position.x;
                        cue.align = 'center';
                        cue.positionAlign = 'center';
                    }
                    console.log(`次字幕位置已应用: line=${70 + position.y}, position=${50 + position.x}, cues数量=${track.cues.length}`);
                } else {
                    console.warn('次字幕轨道没有cues');
                }
            }
        }
    }
    
    // 打开字幕颜色选择器
    openSubtitleColorPicker() {
        const colorPicker = document.getElementById('subtitleColorPicker');
        if (!colorPicker) return;
        
        // 显示颜色选择器
        colorPicker.style.display = 'block';
        
        // 设置当前颜色
        const customColorInput = document.getElementById('customColorInput');
        const colorValueDisplay = document.getElementById('colorValueDisplay');
        const currentStyle = this.getCurrentSubtitleStyle();
        
        if (customColorInput && colorValueDisplay) {
            const currentColor = this.rgbToHex(currentStyle.color);
            customColorInput.value = currentColor;
            colorValueDisplay.textContent = currentColor;
        }
        
        const subtitleType = this.currentSubtitleTab === 'main' ? '主' : '次';
        console.log(`打开${subtitleType}字幕颜色选择器`);
    }
    
    // 初始化颜色选择器事件
    initColorPicker() {
        const colorPicker = document.getElementById('subtitleColorPicker');
        const closeColorPicker = document.getElementById('closeColorPicker');
        const cancelColorPicker = document.getElementById('cancelColorPicker');
        const confirmColorPicker = document.getElementById('confirmColorPicker');
        const basicColors = document.getElementById('basicColors');
        const customColorInput = document.getElementById('customColorInput');
        const colorValueDisplay = document.getElementById('colorValueDisplay');
        
        if (!colorPicker) return;
        
        // 阻止颜色选择器内的点击事件冒泡，防止触发外部关闭逻辑
        colorPicker.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        
        let selectedColor = '#FFFFFF';
        
        // 关闭按钮
        if (closeColorPicker) {
            closeColorPicker.addEventListener('click', () => {
                colorPicker.style.display = 'none';
            });
        }
        
        // 取消按钮
        if (cancelColorPicker) {
            cancelColorPicker.addEventListener('click', () => {
                colorPicker.style.display = 'none';
            });
        }
        
        // 确定按钮（由于颜色已实时应用，这里只需关闭对话框）
        if (confirmColorPicker) {
            confirmColorPicker.addEventListener('click', () => {
                const subtitleType = this.currentSubtitleTab === 'main' ? '主' : '次';
                this.showNotification(`${subtitleType}字幕颜色已设置`, 'success');
                colorPicker.style.display = 'none';
            });
        }
        
        // 基本颜色选择
        if (basicColors) {
            basicColors.addEventListener('click', (e) => {
                const colorItem = e.target.closest('.color-item');
                if (colorItem) {
                    selectedColor = colorItem.getAttribute('data-color');
                    
                    // 更新选中状态
                    basicColors.querySelectorAll('.color-item').forEach(item => {
                        item.classList.remove('selected');
                    });
                    colorItem.classList.add('selected');
                    
                    // 更新自定义颜色输入框
                    if (customColorInput && colorValueDisplay) {
                        customColorInput.value = selectedColor;
                        colorValueDisplay.textContent = selectedColor;
                    }
                    
                    // 实时应用颜色
                    const currentStyle = this.getCurrentSubtitleStyle();
                    currentStyle.color = selectedColor;
                    const subtitleType = this.currentSubtitleTab === 'main' ? '主' : '次';
                    console.log(`${subtitleType}字幕颜色实时更新为:`, selectedColor);
                    this.reloadCurrentSubtitleWithStyle();
                }
            });
        }
        
        // 自定义颜色输入
        if (customColorInput && colorValueDisplay) {
            customColorInput.addEventListener('input', (e) => {
                selectedColor = e.target.value.toUpperCase();
                colorValueDisplay.textContent = selectedColor;
                
                // 取消基本颜色的选中状态
                if (basicColors) {
                    basicColors.querySelectorAll('.color-item').forEach(item => {
                        item.classList.remove('selected');
                    });
                }
                
                // 实时应用颜色
                const currentStyle = this.getCurrentSubtitleStyle();
                currentStyle.color = selectedColor;
                const subtitleType = this.currentSubtitleTab === 'main' ? '主' : '次';
                console.log(`${subtitleType}字幕颜色实时更新为:`, selectedColor);
                this.reloadCurrentSubtitleWithStyle();
            });
        }
        
        console.log('颜色选择器初始化成功');
    }
    
    // RGB颜色转十六进制
    rgbToHex(color) {
        // 如果已经是十六进制格式，直接返回
        if (color.startsWith('#')) {
            return color;
        }
        
        // 处理 rgb(r, g, b) 格式
        const rgb = color.match(/\d+/g);
        if (rgb && rgb.length >= 3) {
            const r = parseInt(rgb[0]).toString(16).padStart(2, '0');
            const g = parseInt(rgb[1]).toString(16).padStart(2, '0');
            const b = parseInt(rgb[2]).toString(16).padStart(2, '0');
            return `#${r}${g}${b}`;
        }
        
        return '#FFFFFF'; // 默认白色
    }
    
    // 应用字幕同步
    applySubtitleSync() {
        if (this.currentSubtitleTab === 'main') {
            // 重新加载主字幕以应用延迟
            if (this.currentSubtitle !== null && this.subtitleFiles[this.currentSubtitle]) {
                const subtitleInfo = this.subtitleFiles[this.currentSubtitle];
                
                // 创建带延迟的新URL
                const modifiedContent = this.applyDelayToSubtitle(subtitleInfo.originalContent || subtitleInfo.content, this.subtitleDelay);
                const styledContent = this.addSubtitleStyleClass(modifiedContent, 'main');
                const blob = new Blob([styledContent], { type: 'text/vtt' });
                const url = URL.createObjectURL(blob);
                
                // 更新存储的URL
                subtitleInfo.url = url;
                
                // 重新应用主字幕
                this.applySubtitle(url, 'main');
                this.applyMainSubtitleStyle();
                
                console.log('主字幕同步已应用，延迟:', this.subtitleDelay, 'ms');
                this.showNotification(`主字幕同步: ${this.subtitleDelay > 0 ? '+' : ''}${this.subtitleDelay}毫秒`, 'info');
            }
        } else {
            // 重新加载次字幕以应用延迟
            if (this.currentSecondarySubtitle !== null && this.secondarySubtitleFiles[this.currentSecondarySubtitle]) {
                const subtitleInfo = this.secondarySubtitleFiles[this.currentSecondarySubtitle];
                
                // 创建带延迟的新URL
                const modifiedContent = this.applyDelayToSubtitle(subtitleInfo.originalContent || subtitleInfo.content, this.secondarySubtitleDelay);
                const styledContent = this.addSubtitleStyleClass(modifiedContent, 'secondary');
                const blob = new Blob([styledContent], { type: 'text/vtt' });
                const url = URL.createObjectURL(blob);
                
                // 更新存储的URL
                subtitleInfo.url = url;
                
                // 重新应用次字幕
                this.applySubtitle(url, 'secondary');
                this.applySecondarySubtitleStyle();
                
                console.log('次字幕同步已应用，延迟:', this.secondarySubtitleDelay, 'ms');
                this.showNotification(`次字幕同步: ${this.secondarySubtitleDelay > 0 ? '+' : ''}${this.secondarySubtitleDelay}毫秒`, 'info');
            }
        }
    }
    
    // 为字幕内容应用时间延迟
    applyDelayToSubtitle(vttContent, delayMs) {
        const lines = vttContent.split('\n');
        const delaySeconds = delayMs / 1000;
        
        const result = lines.map(line => {
            // 匹配时间码行：00:00:01.000 --> 00:00:04.000
            const timeMatch = line.match(/(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/);
            
            if (timeMatch) {
                const startTime = this.parseVTTTime(timeMatch[1]);
                const endTime = this.parseVTTTime(timeMatch[2]);
                
                const newStartTime = Math.max(0, startTime + delaySeconds);
                const newEndTime = Math.max(0, endTime + delaySeconds);
                
                return `${this.formatVTTTime(newStartTime)} --> ${this.formatVTTTime(newEndTime)}`;
            }
            
            return line;
        });
        
        return result.join('\n');
    }
    
    // 解析VTT时间码为秒数
    parseVTTTime(timeStr) {
        const parts = timeStr.split(':');
        const hours = parseInt(parts[0]);
        const minutes = parseInt(parts[1]);
        const seconds = parseFloat(parts[2]);
        
        return hours * 3600 + minutes * 60 + seconds;
    }
    
    // 将秒数格式化为VTT时间码
    formatVTTTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toFixed(3).padStart(6, '0')}`;
    }

    // ========== 检查更新 ==========
    /**
     * 手动触发更新检查
     */
    async checkForUpdates() {
        if (!window.electronAPI || !window.electronAPI.checkUpdate) {
            const t = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t.bind(i18n) : (k) => k;
            this.showNotification(t('update.check_not_available'), 'error');
            return;
        }

        try {
            const t = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t.bind(i18n) : (k) => k;
            this.showNotification(t('update.checking'), 'info');
            await window.electronAPI.checkUpdate();
        } catch (error) {
            console.error('检查更新失败:', error);
            const t = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t.bind(i18n) : (k) => k;
            this.showNotification(t('update.check_failed_toast'), 'error');
        }
    }

    /**
     * 初始化更新相关的 IPC 监听
     */
    initUpdateListeners() {
        if (!window.electronAPI) return;

        try {
            // 检查更新结果（已是最新 / 检查失败）用应用内深色弹窗展示，替代系统原生对话框
            if (typeof window.electronAPI.onUpdateResult === 'function') {
                window.electronAPI.onUpdateResult((data) => {
                    const t = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t.bind(i18n) : (k) => k;

                    let title = '';
                    let message = '';
                    let detail = '';

                    if (data && data.code === 'no_update') {
                        title = t('update.no_update_title');
                        message = t('update.no_update_message', { version: data.currentVersion || '' });
                        detail = t('update.no_update_detail');
                    } else if (data && data.code === 'check_failed') {
                        title = t('update.check_failed_title');
                        message = t('update.check_failed_message', { error: data.errorMessage || '' });
                        detail = '';
                    } else {
                        // 兼容旧数据结构
                        title = data.title || t('menu.check_update');
                        message = data.message || '';
                        detail = data.detail || '';
                    }

                    const fullMessage = detail ? `${message}\n\n${detail}` : message;
                    this.showAlert(fullMessage, data.type || 'info', title);
                });
            }

            // 发现新版本
            if (typeof window.electronAPI.onUpdateAvailable === 'function') {
                window.electronAPI.onUpdateAvailable((info) => {
                    console.log('发现新版本:', info);
                    this.showConfirm(
                        `发现新版本 v${info.version}，是否立即下载更新？\n\n更新说明:\n${info.releaseNotes || '无'}`,
                        'info',
                        '发现新版本'
                    ).then(confirmed => {
                        if (confirmed) {
                            if (window.electronAPI.downloadUpdate) {
                                window.electronAPI.downloadUpdate();
                                this.showNotification('开始下载更新...', 'info');
                            }
                        }
                    });
                });
            }

            // 已经是最新版本
            if (typeof window.electronAPI.onUpdateNotAvailable === 'function') {
                window.electronAPI.onUpdateNotAvailable((info) => {
                    console.log('已经是最新版本:', info);
                    this.showNotification('当前已是最新版本', 'success');
                });
            }

            // 更新下载进度
            if (typeof window.electronAPI.onUpdateProgress === 'function') {
                window.electronAPI.onUpdateProgress((progressObj) => {
                    const percent = Math.floor(progressObj.percent);
                    console.log(`下载进度: ${percent}%`);
                    if (this.loadingOverlay) {
                        this.loadingOverlay.style.display = 'flex';
                        const loadingText = this.loadingOverlay.querySelector('.loading-text');
                        if (loadingText) {
                            loadingText.textContent = `正在下载更新: ${percent}%`;
                        }
                    }
                });
            }

            // 更新下载完成
            if (typeof window.electronAPI.onUpdateDownloaded === 'function') {
                window.electronAPI.onUpdateDownloaded((info) => {
                    console.log('更新下载完成:', info);
                    if (this.loadingOverlay) {
                        this.loadingOverlay.style.display = 'none';
                    }
                    this.showConfirm(
                        '更新下载完成，是否立即安装并重启应用？',
                        'success',
                        '更新就绪'
                    ).then(confirmed => {
                        if (confirmed) {
                            if (window.electronAPI.installUpdate) {
                                window.electronAPI.installUpdate();
                            }
                        }
                    });
                });
            }

            // 更新出错
            if (typeof window.electronAPI.onUpdateError === 'function') {
                window.electronAPI.onUpdateError((err) => {
                    console.error('更新过程出错:', err);
                    if (this.loadingOverlay) {
                        this.loadingOverlay.style.display = 'none';
                    }
                    this.showNotification('更新出错: ' + (err.message || '未知错误'), 'error');
                });
            }
        } catch (error) {
            console.error('初始化更新监听失败:', error);
        }
    }

    // ========== 关灯模式 ==========
    initLightsOff() {
        if (!this.lightsOffOverlay) {
            console.error('关灯遮罩层未找到！');
            return;
        }
        
        // 关灯菜单
        const lightsOffMenu = document.getElementById('lightsOffMenu');
        if (lightsOffMenu) {
            lightsOffMenu.addEventListener('click', () => {
                this.toggleLightsOff();
            });
        }
        
        // 点击遮罩层退出关灯模式
        this.lightsOffOverlay.addEventListener('click', () => {
            if (this.isLightsOff) {
                this.toggleLightsOff();
            }
        });
        
        console.log('关灯模式初始化成功');
    }
    
    toggleLightsOff() {
        const toggleLightsOff = document.getElementById('toggleLightsOff');
        
        if (toggleLightsOff) {
            // 切换checkbox状态，触发change事件
            toggleLightsOff.checked = !toggleLightsOff.checked;
            toggleLightsOff.dispatchEvent(new Event('change'));
        }
    }

    // ========== 文件关联 ==========
    initFileAssociation() {
        // 全选按钮
        const btnSelectAll = document.getElementById('btnSelectAll');
        if (btnSelectAll) {
            btnSelectAll.addEventListener('click', () => {
                document.querySelectorAll('.file-association-item input[type="checkbox"]').forEach(cb => {
                    cb.checked = true;
                });
                console.log('已全选文件关联');
            });
        }
        
        // 全不选按钮
        const btnSelectNone = document.getElementById('btnSelectNone');
        if (btnSelectNone) {
            btnSelectNone.addEventListener('click', () => {
                document.querySelectorAll('.file-association-item input[type="checkbox"]').forEach(cb => {
                    cb.checked = false;
                });
                console.log('已取消全部文件关联');
            });
        }
        
        // 恢复默认按钮
        const btnRestoreDefault = document.getElementById('btnRestoreDefault');
        if (btnRestoreDefault) {
            btnRestoreDefault.addEventListener('click', () => {
                document.querySelectorAll('.file-association-item input[type="checkbox"]').forEach(cb => {
                    cb.checked = true;
                });
                console.log('已恢复默认文件关联');
            });
        }

        // 设为默认播放器按钮
        const btnSetAsDefault = document.getElementById('btnSetAsDefault');
        if (btnSetAsDefault) {
            btnSetAsDefault.addEventListener('click', () => {
                if (window.electronAPI && window.electronAPI.setAsDefault) {
                    window.electronAPI.setAsDefault();
                    this.showNotification('请在弹出的系统设置窗口中，将默认视频播放器更改为“鲲穹AI播放器”', 'info');
                }
            });
        }
        // 刷新默认播放器状态按钮（用户在系统设置中修改后可手动刷新）
        const btnRefreshDefaultStatus = document.getElementById('btnRefreshDefaultStatus');
        if (btnRefreshDefaultStatus) {
            btnRefreshDefaultStatus.addEventListener('click', () => this.updateDefaultPlayerStatus());
        }
        
        console.log('文件关联初始化成功');
    }

    /**
     * 更新默认播放器状态显示
     */
    async updateDefaultPlayerStatus() {
        const statusContainer = document.getElementById('defaultPlayerStatus');
        const statusText = statusContainer?.querySelector('.status-text');
        const btnSetDefault = document.getElementById('btnSetAsDefault');

        if (!statusContainer || !statusText || !btnSetDefault) return;

        if (window.electronAPI && window.electronAPI.checkDefaultStatus) {
            try {
                statusText.textContent = i18n.t('settings.file_assoc.status_checking');
                statusText.className = 'status-text';
                const isDefault = await window.electronAPI.checkDefaultStatus();
                if (isDefault) {
                    // TODO-Guardian: Add a visual indicator or badge to the app icon when it's the default player
                    statusText.textContent = i18n.t('settings.file_assoc.status_is_default');
                    statusText.className = 'status-text is-default';
                    btnSetDefault.disabled = true;
                    btnSetDefault.textContent = i18n.t('settings.file_assoc.btn_already_set');
                } else {
                    statusText.textContent = i18n.t('settings.file_assoc.status_not_default');
                    statusText.className = 'status-text not-default';
                    btnSetDefault.disabled = false;
                    btnSetDefault.textContent = i18n.t('settings.file_assoc.btn_set_default');
                }
            } catch (error) {
                console.error('检查默认播放器状态失败:', error);
                statusText.textContent = i18n.t('settings.file_assoc.status_check_failed');
            }
        } else {
            statusContainer.style.display = 'none';
        }
    }

    // ========== 数字输入控制 ==========
    initNumberControls() {
        // 通用数字输入控制已在各个具体功能中实现
        // 包括音频调节、播放设置等
        console.log('数字输入控制系统已初始化');
    }

    // ========== 播放设置 ==========
    initPlaybackSettings() {
        // 快进步长 - 立即生效
        const fastForwardStep = document.getElementById('fastForwardStep');
        if (fastForwardStep) {
            fastForwardStep.addEventListener('change', (e) => {
                this.fastForwardStep = parseInt(e.target.value);
                console.log('快进步长已更新并立即生效:', this.fastForwardStep + '秒');
            });
            
            // 监听input事件实现实时更新
            fastForwardStep.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                if (!isNaN(value) && value >= 1 && value <= 60) {
                    this.fastForwardStep = value;
                }
            });
        }
        
        // 快退步长 - 立即生效
        const rewindStep = document.getElementById('rewindStep');
        if (rewindStep) {
            rewindStep.addEventListener('change', (e) => {
                this.rewindStep = parseInt(e.target.value);
                console.log('快退步长已更新并立即生效:', this.rewindStep + '秒');
            });
            
            // 监听input事件实现实时更新
            rewindStep.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                if (!isNaN(value) && value >= 1 && value <= 60) {
                    this.rewindStep = value;
                }
            });
        }
        
        // 加速/减速步长 - 立即生效
        const speedStep = document.getElementById('speedStep');
        if (speedStep) {
            speedStep.addEventListener('change', (e) => {
                this.speedStep = parseFloat(e.target.value);
                console.log('速度步长已更新并立即生效:', this.speedStep + '倍');
            });
            
            // 监听input事件实现实时更新
            speedStep.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                if (!isNaN(value) && value >= 0.05 && value <= 2) {
                    this.speedStep = value;
                }
            });
        }
        
        // 播放列表选项
        const promptCleanup = document.getElementById('promptCleanup');
        const maxListItems = document.getElementById('maxListItems');
        
        if (promptCleanup && maxListItems) {
            promptCleanup.addEventListener('change', (e) => {
                maxListItems.disabled = !e.target.checked;
            });
        }
    }

    savePlaybackSettings() {
        try {
            const settings = {
                fastForwardStep: this.fastForwardStep,
                rewindStep: this.rewindStep,
                speedStep: this.speedStep,
                continueLastPlaylist: document.getElementById('continueLastPlaylist')?.checked,
                rememberResume: document.getElementById('rememberResume')?.checked,
                autoAddSimilar: document.getElementById('autoAddSimilar')?.checked,
                clearListOnOpen: document.getElementById('clearListOnOpen')?.checked,
                promptCleanup: document.getElementById('promptCleanup')?.checked,
                maxListItems: parseInt(document.getElementById('maxListItems')?.value || 1000)
            };
            localStorage.setItem('playback_settings', JSON.stringify(settings));
            console.log('播放设置已保存:', settings);
        } catch (e) {
            console.error('保存播放设置失败:', e);
        }
    }

    loadPlaybackSettings() {
        try {
            const settings = JSON.parse(localStorage.getItem('playback_settings') || '{}');
            
            if (settings.fastForwardStep) this.fastForwardStep = settings.fastForwardStep;
            if (settings.rewindStep) this.rewindStep = settings.rewindStep;
            if (settings.speedStep) this.speedStep = settings.speedStep;
            
            // 恢复到界面
            const fastForwardStepEl = document.getElementById('fastForwardStep');
            const rewindStepEl = document.getElementById('rewindStep');
            const speedStepEl = document.getElementById('speedStep');
            
            if (fastForwardStepEl) fastForwardStepEl.value = this.fastForwardStep;
            if (rewindStepEl) rewindStepEl.value = this.rewindStep;
            if (speedStepEl) speedStepEl.value = this.speedStep;
            
            // 恢复复选框状态
            if (settings.continueLastPlaylist !== undefined) {
                const el = document.getElementById('continueLastPlaylist');
                if (el) el.checked = settings.continueLastPlaylist;
            }
            if (settings.rememberResume !== undefined) {
                this.rememberResume = settings.rememberResume;
                const el = document.getElementById('rememberResume');
                if (el) el.checked = settings.rememberResume;
            }
            if (settings.autoAddSimilar !== undefined) {
                const el = document.getElementById('autoAddSimilar');
                if (el) el.checked = settings.autoAddSimilar;
            }
            if (settings.clearListOnOpen !== undefined) {
                const el = document.getElementById('clearListOnOpen');
                if (el) el.checked = settings.clearListOnOpen;
            }
            if (settings.promptCleanup !== undefined) {
                const el = document.getElementById('promptCleanup');
                if (el) el.checked = settings.promptCleanup;
            }
            if (settings.maxListItems) {
                const el = document.getElementById('maxListItems');
                if (el) el.value = settings.maxListItems;
            }
            
        } catch (e) {
            console.error('加载播放设置失败:', e);
        }
    }

    // ========== 截图设置 ==========
    initScreenshotSettings() {
        const pathDisplay = document.getElementById('screenshotPathDisplay');
        const changePathBtn = document.getElementById('changeScreenshotPath');
        const formatSelect = document.getElementById('screenshotFormatSelect');
        const autoPopupCheckbox = document.getElementById('screenshotAutoPopup');
        
        // 初始化截图路径显示
        if (pathDisplay) {
            if (this.screenshotPath) {
                pathDisplay.value = this.screenshotPath;
            } else if (window.electronAPI && typeof window.electronAPI.getPath === 'function') {
                window.electronAPI
                    .getPath('pictures')
                    .then((picturesPath) => {
                        if (!picturesPath || this.screenshotPath) {
                            return;
                        }
                        pathDisplay.value = picturesPath;
                        this.screenshotPath = picturesPath;
                        localStorage.setItem('screenshot_path', this.screenshotPath);
                    })
                    .catch(() => {});
            }
        }
        
        // 更换路径按钮
        if (changePathBtn) {
            changePathBtn.addEventListener('click', async () => {
                console.log('点击更换路径按钮');
                
                try {
                    // 方式1：通过electronAPI (最推荐，preload.js暴露的安全API)
                    if (window.electronAPI && window.electronAPI.selectDirectory) {
                        console.log('使用electronAPI方式');
                        const result = await window.electronAPI.selectDirectory({
                            title: '选择截图保存文件夹',
                            defaultPath: this.screenshotPath || ''
                        });
                        
                        if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
                            this.screenshotPath = result.filePaths[0];
                            if (pathDisplay) {
                                pathDisplay.value = this.screenshotPath;
                            }
                            localStorage.setItem('screenshot_path', this.screenshotPath);
                            console.log('截图保存路径已更新:', this.screenshotPath);
                            return;
                        }
                        return;
                    }
                    
                    // 方式2：通过ipcRenderer (备用方式)
                    if (window.ipcRenderer && window.ipcRenderer.invoke) {
                        console.log('使用ipcRenderer方式');
                        const result = await window.ipcRenderer.invoke('select-directory', {
                            title: '选择截图保存文件夹',
                            defaultPath: this.screenshotPath || ''
                        });
                        
                        if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
                            this.screenshotPath = result.filePaths[0];
                            if (pathDisplay) {
                                pathDisplay.value = this.screenshotPath;
                            }
                            localStorage.setItem('screenshot_path', this.screenshotPath);
                            console.log('截图保存路径已更新:', this.screenshotPath);
                            return;
                        }
                        return;
                    }
                    
                    // 如果以上方式都不可用
                    console.warn('无可用的文件选择API');
                    alert('此功能需要在Electron桌面应用中使用\n\n当前环境不支持文件选择对话框');
                    
                } catch (error) {
                    console.error('选择文件夹失败:', error);
                    alert('选择文件夹失败: ' + error.message + '\n\n请确保应用正确配置并在Electron环境中运行');
                }
            });
        }
        
        // 截图格式选择
        if (formatSelect) {
            // 从localStorage加载保存的格式
            const savedFormat = localStorage.getItem('screenshot_format') || 'jpg';
            formatSelect.value = savedFormat;
            this.screenshotFormat = savedFormat === 'jpg' ? 'jpeg' : savedFormat;
            
            formatSelect.addEventListener('change', (e) => {
                const format = e.target.value;
                // jpg转换为jpeg用于内部处理
                this.screenshotFormat = format === 'jpg' ? 'jpeg' : format;
                localStorage.setItem('screenshot_format', format);
                console.log('截图格式已更新:', this.screenshotFormat);
            });
        }
        
        // 截图后自动弹出选项
        if (autoPopupCheckbox) {
            // 从localStorage加载设置
            const autoPopup = localStorage.getItem('screenshot_auto_popup');
            if (autoPopup !== null) {
                autoPopupCheckbox.checked = autoPopup === 'true';
            }
            this.screenshotAutoPopup = autoPopupCheckbox.checked;
            
            autoPopupCheckbox.addEventListener('change', (e) => {
                this.screenshotAutoPopup = e.target.checked;
                localStorage.setItem('screenshot_auto_popup', this.screenshotAutoPopup);
                console.log('截图自动弹出:', this.screenshotAutoPopup ? '开启' : '关闭');
            });
        }
        
        console.log('截图设置初始化完成');
    }

    // ========== 加载提示 ==========
    showLoading(message = '正在加载...') {
        if (this.loadingOverlay) {
            const p = this.loadingOverlay.querySelector('p');
            if (p) p.textContent = message;
            this.loadingOverlay.classList.add('active');
            this.loadingOverlay.style.display = 'flex';
            console.log('Loading overlay 已显示:', message);
        } else {
            console.error('loadingOverlay 元素未找到');
        }
    }

    hideLoading() {
        if (this.loadingOverlay) {
            this.loadingOverlay.classList.remove('active');
            this.loadingOverlay.style.display = 'none';
            console.log('Loading overlay 已隐藏');
        } else {
            console.error('loadingOverlay 元素未找到');
        }
    }

    // ========== 画质调节 ==========
    initPictureQuality() {
        // 打开/关闭画质调节面板
        this.pictureQualityBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isActive = this.pictureQualityPanel.classList.toggle('active');
            
            // 切换按钮激活状态
            if (isActive) {
                this.pictureQualityBtn.classList.add('active');
            } else {
                this.pictureQualityBtn.classList.remove('active');
            }
        });
        
        this.closePictureQuality.addEventListener('click', () => {
            this.pictureQualityPanel.classList.remove('active');
            this.pictureQualityBtn.classList.remove('active');
            const menuBtn = document.getElementById('pictureQualityMenuBtn');
            if (menuBtn) menuBtn.classList.remove('active');
        });
        
        // 点击面板外关闭
        document.addEventListener('click', (e) => {
            const menuBtn = document.getElementById('pictureQualityMenuBtn');
            if (!this.pictureQualityPanel.contains(e.target) && 
                !this.pictureQualityBtn.contains(e.target) &&
                !(menuBtn && menuBtn.contains(e.target))) {
                this.pictureQualityPanel.classList.remove('active');
                this.pictureQualityBtn.classList.remove('active');
                if (menuBtn) menuBtn.classList.remove('active');
            }
        });
        
        // 亮度滑块
        this.brightnessSlider.addEventListener('input', (e) => {
            this.brightness = e.target.value;
            e.target.nextElementSibling.textContent = this.brightness + '%';
            this.applyFilters();
        });
        
        // 对比度滑块
        this.contrastSlider.addEventListener('input', (e) => {
            this.contrast = e.target.value;
            e.target.nextElementSibling.textContent = this.contrast + '%';
            this.applyFilters();
        });
        
        // 饱和度滑块
        this.saturationSlider.addEventListener('input', (e) => {
            this.saturation = e.target.value;
            e.target.nextElementSibling.textContent = this.saturation + '%';
            this.applyFilters();
        });
        
        // 色调滑块
        this.hueSlider.addEventListener('input', (e) => {
            this.hue = e.target.value;
            e.target.nextElementSibling.textContent = this.hue + '°';
            this.applyFilters();
        });
        
        // 预设滤镜
        document.querySelectorAll('.filter-preset').forEach(preset => {
            preset.addEventListener('click', () => {
                document.querySelectorAll('.filter-preset').forEach(p => p.classList.remove('active'));
                preset.classList.add('active');
                this.applyPresetFilter(preset.dataset.filter);
            });
        });
        
        // 比例选项
        document.querySelectorAll('input[name="ratio"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.changeAspectRatio(e.target.value);
            });
        });
        
        // 旋转和翻转
        document.getElementById('rotateLeft').addEventListener('click', () => {
            this.rotation -= 90;
            this.applyTransform();
        });
        
        document.getElementById('rotateRight').addEventListener('click', () => {
            this.rotation += 90;
            this.applyTransform();
        });
        
        document.getElementById('flipHorizontal').addEventListener('click', () => {
            this.flipH = !this.flipH;
            this.applyTransform();
        });
        
        document.getElementById('flipVertical').addEventListener('click', () => {
            this.flipV = !this.flipV;
            this.applyTransform();
        });
        
        document.getElementById('resetRotation').addEventListener('click', () => {
            this.rotation = 0;
            this.flipH = false;
            this.flipV = false;
            this.applyTransform();
        });
        
        // 平移
        document.querySelectorAll('.dir-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const direction = btn.dataset.direction;
                const step = 10;
                
                switch(direction) {
                    case 'n':
                        this.panY -= step;
                        break;
                    case 's':
                        this.panY += step;
                        break;
                    case 'w':
                        this.panX -= step;
                        break;
                    case 'e':
                        this.panX += step;
                        break;
                }
                this.applyTransform();
            });
        });
        
        document.getElementById('resetPan').addEventListener('click', () => {
            this.panX = 0;
            this.panY = 0;
            this.applyTransform();
        });
        
        // 缩放（等比例）
        document.querySelectorAll('.zoom-btn-large').forEach(btn => {
            btn.addEventListener('click', () => {
                const zoom = btn.dataset.zoom;
                const step = 0.1;
                
                if (zoom === 'in') {
                    // 放大 - 最大放大到3倍
                    this.scale = Math.min(3, this.scale + step);
                } else if (zoom === 'out') {
                    // 缩小 - 最小缩小到0.5倍
                    this.scale = Math.max(0.5, this.scale - step);
                }
                this.applyTransform();
            });
        });
        
        document.getElementById('resetZoom').addEventListener('click', () => {
            this.scale = 1;
            this.applyTransform();
        });
    }

    applyFilters() {
        // 全景功能已移除
        
        const filter = `brightness(${this.brightness}%) contrast(${this.contrast}%) saturate(${this.saturation}%) hue-rotate(${this.hue}deg)`;
        this.video.style.filter = filter;
    }

    applyTransform() {
        // 全景功能已移除
        // if (this.panoramaMode !== 'off') {
        //     return;
        // }
        
        const scaleX = this.flipH ? -1 : 1;
        const scaleY = this.flipV ? -1 : 1;
        const transform = `translate(${this.panX}px, ${this.panY}px) rotate(${this.rotation}deg) scale(${this.scale * scaleX}, ${this.scale * scaleY})`;
        this.video.style.transform = transform;
    }

    applyPresetFilter(filter) {
        switch(filter) {
            case 'default':
                this.brightness = 100;
                this.contrast = 100;
                this.saturation = 100;
                this.hue = 0;
                break;
            case 'bright':
                this.brightness = 130;
                this.contrast = 110;
                this.saturation = 110;
                this.hue = 0;
                break;
            case 'soft':
                this.brightness = 105;
                this.contrast = 90;
                this.saturation = 80;
                this.hue = 0;
                break;
            case 'retro':
                this.brightness = 110;
                this.contrast = 120;
                this.saturation = 150;
                this.hue = 20;
                break;
        }
        
        this.brightnessSlider.value = this.brightness;
        this.contrastSlider.value = this.contrast;
        this.saturationSlider.value = this.saturation;
        this.hueSlider.value = this.hue;
        
        document.querySelector('#brightness + .slider-value').textContent = this.brightness + '%';
        document.querySelector('#contrast + .slider-value').textContent = this.contrast + '%';
        document.querySelector('#saturation + .slider-value').textContent = this.saturation + '%';
        document.querySelector('#hue + .slider-value').textContent = this.hue + '°';
        
        this.applyFilters();
    }

    changeAspectRatio(ratio) {
        this.currentAspectRatio = ratio;
        this.updateVideoSize();
    }

    updateVideoSize() {
        if (!this.video) return;
        
        const container = this.video.parentElement; // .video-area
        if (!container) return;
        
        // 重置样式以确保计算准确
        this.video.style.width = '100%';
        this.video.style.height = '100%';
        this.video.style.maxWidth = '100%';  // 限制不超出屏幕
        this.video.style.maxHeight = '100%';
        this.video.style.aspectRatio = '';
        
        const cw = container.clientWidth;
        const ch = container.clientHeight;
        
        switch(this.currentAspectRatio) {
            case 'original':
                this.video.style.objectFit = 'contain';
                break;
                
            case 'fill':
                this.video.style.objectFit = 'fill';
                break;
                
            case '16:9':
            case '4:3':
                this.video.style.objectFit = 'fill'; // 拉伸内容以适应盒子
                
                const targetRatio = this.currentAspectRatio === '16:9' ? 16/9 : 4/3;
                const containerRatio = cw / ch;
                
                if (containerRatio > targetRatio) {
                    // 容器比目标更宽，以高度为基准（填满高度），宽度根据比例计算
                    this.video.style.width = Math.min(ch * targetRatio, cw) + 'px';
                    this.video.style.height = '100%';
                } else {
                    // 容器比目标更窄（或更高），以宽度为基准（填满宽度），高度根据比例计算
                    this.video.style.width = '100%';
                    this.video.style.height = Math.min(cw / targetRatio, ch) + 'px';
                }
                break;
        }
    }

    // ========== 音频调节 ==========
    initAudioAdjust() {
        // 打开/关闭音频调节面板
        this.audioAdjustBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isActive = this.audioAdjustPanel.classList.toggle('active');
            
            // 切换按钮激活状态
            if (isActive) {
                this.audioAdjustBtn.classList.add('active');
                // 关闭画质面板
                this.pictureQualityPanel.classList.remove('active');
                this.pictureQualityBtn.classList.remove('active');
                const pictureMenuBtn = document.getElementById('pictureQualityMenuBtn');
                if (pictureMenuBtn) pictureMenuBtn.classList.remove('active');
                
                // 同步音量滑块的值
                this.syncAudioVolumeSlider();
            } else {
                this.audioAdjustBtn.classList.remove('active');
            }
            
            this.updateVolumeVisualizer();
        });
        
        this.closeAudioAdjust.addEventListener('click', () => {
            this.audioAdjustPanel.classList.remove('active');
            this.audioAdjustBtn.classList.remove('active');
            const menuBtn = document.getElementById('audioAdjustMenuBtn');
            if (menuBtn) menuBtn.classList.remove('active');
        });
        
        // 点击面板外关闭
        document.addEventListener('click', (e) => {
            const menuBtn = document.getElementById('audioAdjustMenuBtn');
            if (!this.audioAdjustPanel.contains(e.target) && 
                !this.audioAdjustBtn.contains(e.target) &&
                !(menuBtn && menuBtn.contains(e.target))) {
                this.audioAdjustPanel.classList.remove('active');
                this.audioAdjustBtn.classList.remove('active');
                if (menuBtn) menuBtn.classList.remove('active');
            }
        });
        
        // 音量变化时更新可视化
        this.video.addEventListener('volumechange', () => {
            this.updateVolumeVisualizer();
        });
        
        // 音频时间调节
        document.querySelectorAll('input[name="timing"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const advanceInput = document.getElementById('audioAdvance');
                const delayInput = document.getElementById('audioDelay');
                
                if (e.target.value === 'advance') {
                    advanceInput.disabled = false;
                    delayInput.disabled = true;
                    delayInput.value = 0;
                } else {
                    advanceInput.disabled = true;
                    delayInput.disabled = false;
                    advanceInput.value = 0;
                }
            });
        });
        
        // 数字输入控制
        document.querySelectorAll('.num-up, .num-down').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = btn.dataset.target;
                const target = document.getElementById(targetId);
                
                if (target && !target.disabled) {
                    const isUp = btn.classList.contains('num-up');
                    const currentValue = parseFloat(target.value) || 0;
                    const min = parseFloat(target.min) || 0;
                    const max = parseFloat(target.max) || 5000;
                    const step = parseFloat(target.step) || 1;
                    
                    let newValue;
                    if (isUp) {
                        newValue = Math.min(currentValue + step, max);
                    } else {
                        newValue = Math.max(currentValue - step, min);
                    }
                    
                    target.value = newValue;
                    
                    // 触发change事件以更新播放器设置
                    target.dispatchEvent(new Event('change'));
                }
            });
        });
        
        // 声道选择
        document.querySelectorAll('input[name="audioChannel"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.switchAudioChannel(e.target.value);
            });
        });
        
        // 音频同步控制
        const audioSyncMinus100 = document.getElementById('audioSyncMinus100');
        const audioSyncPlus100 = document.getElementById('audioSyncPlus100');
        const audioSyncValue = document.getElementById('audioSyncValue');
        const resetAudioSync = document.getElementById('resetAudioSync');
        
        if (audioSyncMinus100) {
            audioSyncMinus100.addEventListener('click', () => {
                this.audioSyncDelay -= 100;
                audioSyncValue.value = this.audioSyncDelay + '毫秒';
                console.log('音频同步延迟:', this.audioSyncDelay);
            });
        }
        
        if (audioSyncPlus100) {
            audioSyncPlus100.addEventListener('click', () => {
                this.audioSyncDelay += 100;
                audioSyncValue.value = this.audioSyncDelay + '毫秒';
                console.log('音频同步延迟:', this.audioSyncDelay);
            });
        }
        
        if (resetAudioSync) {
            resetAudioSync.addEventListener('click', () => {
                this.audioSyncDelay = 0;
                audioSyncValue.value = '0毫秒';
                console.log('音频同步已重置');
            });
        }
        
        // 音轨选择
        const audioTrackSelect = document.getElementById('audioTrackSelect');
        const loadAudioTrackBtn = document.getElementById('loadAudioTrackBtn');
        
        // 监听视频加载，更新音轨列表
        this.video.addEventListener('loadedmetadata', () => {
            this.updateAudioTrackList();
        });
        
        if (loadAudioTrackBtn) {
            loadAudioTrackBtn.addEventListener('click', () => {
                this.loadExternalAudio();
            });
        }
        
        if (audioTrackSelect) {
            audioTrackSelect.addEventListener('change', (e) => {
                const value = e.target.value;
                
                if (value === 'default') {
                    // 切换回默认音轨
                    this.switchToDefaultAudio();
                } else if (value.startsWith('external-')) {
                    // 切换到外部音频
                    const index = parseInt(value.replace('external-', ''));
                    this.switchToExternalAudio(index);
                } else {
                    // 切换内置音轨
                    const trackIndex = parseInt(value);
                    if (!isNaN(trackIndex)) {
                        this.switchAudioTrack(trackIndex);
                    }
                }
            });
        }
        
        // 音频面板音量滑块
        const audioVolumeSlider = document.getElementById('audioVolumeSlider');
        const audioVolumePercentage = document.getElementById('audioVolumePercentage');
        const audioVolumeDown = document.getElementById('audioVolumeDown');
        const audioVolumeUp = document.getElementById('audioVolumeUp');
        
        if (audioVolumeSlider) {
            // 滑块拖动时同步更新
            audioVolumeSlider.addEventListener('input', (e) => {
                const value = e.target.value;
                this.setVolume(value);
                this.volumeSlider.value = value;
                audioVolumePercentage.textContent = value + '%';
                this.updateVolumeVisualizer();
            });
            
            // 音量减小按钮
            audioVolumeDown.addEventListener('click', () => {
                const newVolume = Math.max(0, this.volume - 5);
                this.setVolume(newVolume);
                this.volumeSlider.value = newVolume;
                audioVolumeSlider.value = newVolume;
                audioVolumePercentage.textContent = newVolume + '%';
                this.updateVolumeVisualizer();
            });
            
            // 音量增加按钮
            audioVolumeUp.addEventListener('click', () => {
                const newVolume = Math.min(100, this.volume + 5);
                this.setVolume(newVolume);
                this.volumeSlider.value = newVolume;
                audioVolumeSlider.value = newVolume;
                audioVolumePercentage.textContent = newVolume + '%';
                this.updateVolumeVisualizer();
            });
        }
    }

    updateVolumeVisualizer() {
        const volume = this.video.volume;
        const bars = document.querySelectorAll('.volume-bar');
        const activeCount = Math.round(volume * bars.length);
        
        bars.forEach((bar, index) => {
            if (index < activeCount) {
                bar.classList.add('active');
            } else {
                bar.classList.remove('active');
            }
        });
    }

    syncAudioVolumeSlider() {
        const audioVolumeSlider = document.getElementById('audioVolumeSlider');
        const audioVolumePercentage = document.getElementById('audioVolumePercentage');
        
        if (audioVolumeSlider && audioVolumePercentage) {
            audioVolumeSlider.value = this.volume;
            audioVolumePercentage.textContent = this.volume + '%';
        }
    }
    
    // ========== 音频声道控制 ==========
    
    // 切换声道
    switchAudioChannel(channel) {
        this.currentAudioChannel = channel;
        
        try {
            // 如果没有音频上下文，尝试初始化
            if (!this.audioContext && this.video.captureStream) {
                this.initAudioContext();
            }
            
            if (this.audioGainLeft && this.audioGainRight) {
                switch(channel) {
                    case 'left':
                        // 只播放左声道
                        this.audioGainLeft.gain.value = 1.0;
                        this.audioGainRight.gain.value = 0.0;
                        console.log('已切换到左声道');
                        break;
                    case 'right':
                        // 只播放右声道
                        this.audioGainLeft.gain.value = 0.0;
                        this.audioGainRight.gain.value = 1.0;
                        console.log('已切换到右声道');
                        break;
                    case 'default':
                    default:
                        // 默认立体声
                        this.audioGainLeft.gain.value = 1.0;
                        this.audioGainRight.gain.value = 1.0;
                        console.log('已切换到默认声道');
                        break;
                }
            } else {
                // 简化的声道控制（不使用Web Audio API）
                console.log('声道切换到:', channel);
            }
        } catch (error) {
            console.error('切换声道失败:', error);
        }
    }
    
    // 初始化音频上下文
    initAudioContext() {
        try {
            // 创建音频上下文
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // 创建媒体源
            const stream = this.video.captureStream ? this.video.captureStream() : null;
            if (!stream) {
                console.warn('浏览器不支持captureStream');
                return;
            }
            
            this.audioSource = this.audioContext.createMediaStreamSource(stream);
            
            // 创建声道分离器
            this.audioSplitter = this.audioContext.createChannelSplitter(2);
            
            // 创建增益节点
            this.audioGainLeft = this.audioContext.createGain();
            this.audioGainRight = this.audioContext.createGain();
            
            // 创建声道合并器
            this.audioMerger = this.audioContext.createChannelMerger(2);
            
            // 连接音频节点
            this.audioSource.connect(this.audioSplitter);
            this.audioSplitter.connect(this.audioGainLeft, 0);
            this.audioSplitter.connect(this.audioGainRight, 1);
            this.audioGainLeft.connect(this.audioMerger, 0, 0);
            this.audioGainRight.connect(this.audioMerger, 0, 1);
            this.audioMerger.connect(this.audioContext.destination);
            
            // 静音原视频，使用Web Audio API输出
            this.video.muted = true;
            
            console.log('音频上下文已初始化');
        } catch (error) {
            console.error('初始化音频上下文失败:', error);
        }
    }
    
    // 确保环绕声节点存在（仅在使用时创建，不改变原有声道切换逻辑）
    ensureSurroundNodes() {
        if (!this.surroundOn || !this.video || !this.video.src) return;
        try {
            if (!this.audioContext && this.video.captureStream) {
                this.initAudioContext();
            }
            if (!this.audioContext || !this.audioGainLeft || !this.audioGainRight || !this.audioMerger) return;
            if (this.surroundDelayL) {
                this.applySurroundParams();
                return;
            }
            const ctx = this.audioContext;
            this.surroundDelayL = ctx.createDelay(0.1);
            this.surroundDelayL.delayTime.value = 0.02;
            this.surroundDelayR = ctx.createDelay(0.1);
            this.surroundDelayR.delayTime.value = 0.02;
            this.surroundGainLtoR = ctx.createGain();
            this.surroundGainRtoL = ctx.createGain();
            this.surroundBassFilter = ctx.createBiquadFilter();
            this.surroundBassFilter.type = 'lowshelf';
            this.surroundBassFilter.frequency.value = 200;
            this.surroundBassFilter.gain.value = 0;
            this.audioGainLeft.disconnect();
            this.audioGainRight.disconnect();
            this.audioMerger.disconnect();
            this.audioGainLeft.connect(this.audioMerger, 0, 0);
            this.audioGainRight.connect(this.surroundDelayR);
            this.surroundDelayR.connect(this.surroundGainRtoL);
            this.surroundGainRtoL.connect(this.audioMerger, 0, 0);
            this.audioGainRight.connect(this.audioMerger, 0, 1);
            this.audioGainLeft.connect(this.surroundDelayL);
            this.surroundDelayL.connect(this.surroundGainLtoR);
            this.surroundGainLtoR.connect(this.audioMerger, 0, 1);
            this.audioMerger.connect(this.surroundBassFilter);
            this.surroundBassFilter.connect(ctx.destination);
        } catch (e) {
            console.warn('环绕声节点创建失败:', e);
        }
    }
    
    applySurroundParams() {
        if (!this.surroundGainLtoR || !this.surroundGainRtoL || !this.surroundBassFilter) return;
        const intensity = this.surroundOn && this.surroundMode !== 'off'
            ? (Number(this.surroundIntensity) || 50) / 100 * 0.35
            : 0;
        const bassDb = this.surroundOn && this.surroundMode !== 'off'
            ? (Number(this.surroundBass) || 0) / 100 * 12
            : 0;
        this.surroundGainLtoR.gain.value = intensity;
        this.surroundGainRtoL.gain.value = intensity;
        this.surroundBassFilter.gain.value = bassDb;
    }
    
    // 更新音轨列表
    updateAudioTrackList() {
        const audioTrackSelect = document.getElementById('audioTrackSelect');
        if (!audioTrackSelect) return;
        
        // 清空现有选项
        audioTrackSelect.innerHTML = '<option value="default">默认音轨</option>';
        
        // 获取音轨
        if (this.video.audioTracks && this.video.audioTracks.length > 0) {
            for (let i = 0; i < this.video.audioTracks.length; i++) {
                const track = this.video.audioTracks[i];
                const option = document.createElement('option');
                option.value = i;
                option.textContent = track.label || `音轨 ${i + 1}`;
                if (track.enabled) {
                    option.selected = true;
                }
                audioTrackSelect.appendChild(option);
            }
            console.log(`检测到 ${this.video.audioTracks.length} 个音轨`);
        }
    }
    
    // 切换音轨
    switchAudioTrack(trackIndex) {
        if (!this.video.audioTracks || trackIndex < 0 || trackIndex >= this.video.audioTracks.length) {
            console.warn('无效的音轨索引');
            return;
        }
        
        // 禁用所有音轨
        for (let i = 0; i < this.video.audioTracks.length; i++) {
            this.video.audioTracks[i].enabled = false;
        }
        
        // 启用选中的音轨
        this.video.audioTracks[trackIndex].enabled = true;
        console.log(`已切换到音轨 ${trackIndex + 1}`);
    }
    
    // 载入外部音频
    loadExternalAudio() {
        // 创建文件选择对话框
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'audio/*';
        input.multiple = false; // 一次只载入一个
        
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const url = URL.createObjectURL(file);
            
            // 创建新的音频元素
            const audio = new Audio(url);
            audio.preload = 'metadata';
            
            // 等待音频元数据加载完成
            audio.addEventListener('loadedmetadata', () => {
                const duration = Math.round(audio.duration);
                const minutes = Math.floor(duration / 60);
                const seconds = duration % 60;
                const durationText = minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`;
                
                // 存储音频信息
                const audioInfo = {
                    file: file,
                    url: url,
                    audio: audio,
                    name: file.name,
                    duration: duration,
                    durationText: durationText
                };
                
                this.externalAudios.push(audioInfo);
                
                // 更新音轨列表
                this.addExternalAudioToList(audioInfo, this.externalAudios.length - 1);
                
                console.log(`已载入外部音频: ${file.name} (${durationText})`);
            });
            
            audio.addEventListener('error', (e) => {
                console.error('音频加载失败:', e);
                this.showNotification('载入音频已清除，需手动添加', 'info');
            });
        };
        
        input.click();
    }
    
    // 添加外部音频到列表
    addExternalAudioToList(audioInfo, index) {
        const audioTrackSelect = document.getElementById('audioTrackSelect');
        if (!audioTrackSelect) return;
        
        // 处理文件名：提取主要部分并限制长度
        let displayName = audioInfo.name;
        
        // 移除文件扩展名
        displayName = displayName.replace(/\.(mp3|wav|ogg|m4a|flac|aac|wma)$/i, '');
        
        // 如果名字太长，进行截断
        if (displayName.length > 20) {
            displayName = displayName.substring(0, 20) + '...';
        }
        
        // 创建选项
        const option = document.createElement('option');
        option.value = `external-${index}`;
        option.textContent = `${displayName} (${audioInfo.durationText})`;
        option.title = `${audioInfo.name} (${audioInfo.durationText})`; // 完整名称作为提示
        
        audioTrackSelect.appendChild(option);
        
        // 自动切换到新添加的音频
        audioTrackSelect.value = `external-${index}`;
        this.switchToExternalAudio(index);
    }
    
    // 切换到外部音频
    switchToExternalAudio(index) {
        if (index < 0 || index >= this.externalAudios.length) {
            console.warn('无效的外部音频索引');
            return;
        }
        
        // 停止当前外部音频
        if (this.currentExternalAudio) {
            this.currentExternalAudio.pause();
            this.currentExternalAudio.currentTime = 0;
        }
        
        // 恢复视频原始音量
        if (this.video.muted && this.externalAudios.length === 0) {
            this.video.muted = false;
        }
        
        const audioInfo = this.externalAudios[index];
        const audio = audioInfo.audio;
        
        // 静音视频原始音频
        this.video.muted = true;
        
        // 设置音量
        audio.volume = this.video.volume;
        
        // 同步当前播放位置
        audio.currentTime = this.video.currentTime;
        
        // 如果视频正在播放，也播放音频
        if (!this.video.paused) {
            audio.play().catch(err => console.error('音频播放失败:', err));
        }
        
        // 设置为当前外部音频
        this.currentExternalAudio = audio;
        
        // 绑定同步事件（移除旧的监听器，避免重复）
        this.setupAudioSync(audio);
        
        console.log(`已切换到外部音频: ${audioInfo.name}`);
    }
    
    // 设置音频同步
    setupAudioSync(audio) {
        // 移除之前的事件监听器
        const oldListeners = audio._syncListeners || {};
        
        if (oldListeners.play) this.video.removeEventListener('play', oldListeners.play);
        if (oldListeners.pause) this.video.removeEventListener('pause', oldListeners.pause);
        if (oldListeners.seeked) this.video.removeEventListener('seeked', oldListeners.seeked);
        if (oldListeners.volumechange) this.video.removeEventListener('volumechange', oldListeners.volumechange);
        if (oldListeners.ratechange) this.video.removeEventListener('ratechange', oldListeners.ratechange);
        
        // 创建新的事件监听器
        const playListener = () => {
            if (audio === this.currentExternalAudio) {
                audio.currentTime = this.video.currentTime;
                audio.play().catch(err => console.error('音频播放失败:', err));
            }
        };
        
        const pauseListener = () => {
            if (audio === this.currentExternalAudio) {
                audio.pause();
            }
        };
        
        const seekedListener = () => {
            if (audio === this.currentExternalAudio) {
                audio.currentTime = this.video.currentTime;
            }
        };
        
        const volumechangeListener = () => {
            if (audio === this.currentExternalAudio) {
                audio.volume = this.video.volume;
            }
        };
        
        const ratechangeListener = () => {
            if (audio === this.currentExternalAudio) {
                audio.playbackRate = this.video.playbackRate;
            }
        };
        
        // 添加事件监听器
        this.video.addEventListener('play', playListener);
        this.video.addEventListener('pause', pauseListener);
        this.video.addEventListener('seeked', seekedListener);
        this.video.addEventListener('volumechange', volumechangeListener);
        this.video.addEventListener('ratechange', ratechangeListener);
        
        // 保存监听器引用，便于后续移除
        audio._syncListeners = {
            play: playListener,
            pause: pauseListener,
            seeked: seekedListener,
            volumechange: volumechangeListener,
            ratechange: ratechangeListener
        };
        
        // 同步播放速度
        audio.playbackRate = this.video.playbackRate;
    }
    
    // 切换回默认音频
    switchToDefaultAudio() {
        // 停止当前外部音频
        if (this.currentExternalAudio) {
            this.currentExternalAudio.pause();
            this.currentExternalAudio.currentTime = 0;
            this.currentExternalAudio = null;
        }
        
        // 恢复视频原始音频
        this.video.muted = false;
        
        console.log('已切换回默认音轨');
    }
    
    // 清除所有外部音频（切换视频时调用）
    clearExternalAudios() {
        // 检查是否有外部音频需要清除
        const hasExternalAudio = this.externalAudios.length > 0;
        
        // 停止并清理当前播放的外部音频
        if (this.currentExternalAudio) {
            this.currentExternalAudio.pause();
            this.currentExternalAudio.currentTime = 0;
            
            // 移除事件监听器
            const listeners = this.currentExternalAudio._syncListeners;
            if (listeners) {
                this.video.removeEventListener('play', listeners.play);
                this.video.removeEventListener('pause', listeners.pause);
                this.video.removeEventListener('seeked', listeners.seeked);
                this.video.removeEventListener('volumechange', listeners.volumechange);
                this.video.removeEventListener('ratechange', listeners.ratechange);
            }
            
            this.currentExternalAudio = null;
        }
        
        // 清理所有外部音频对象
        this.externalAudios.forEach(audioInfo => {
            if (audioInfo.audio) {
                audioInfo.audio.pause();
                audioInfo.audio.src = '';
            }
            if (audioInfo.url) {
                URL.revokeObjectURL(audioInfo.url);
            }
        });
        
        // 清空数组
        this.externalAudios = [];
        
        // 恢复视频原始音频
        this.video.muted = false;
        
        // 重置音轨选择器为默认
        const audioTrackSelect = document.getElementById('audioTrackSelect');
        if (audioTrackSelect) {
            // 清除所有外部音频选项
            const options = audioTrackSelect.querySelectorAll('option');
            options.forEach(option => {
                if (option.value.startsWith('external-')) {
                    option.remove();
                }
            });
            
            // 选中默认音轨
            audioTrackSelect.value = 'default';
        }
        
        // 如果清除了外部音频，显示提示
        if (hasExternalAudio) {
            this.showNotification('载入音频已经清除，需手动添加', 'info');
        }
        
        console.log('已清除所有外部音频，恢复默认音轨');
    }

    // ========== 设置面板 ==========
    initSettings() {
        const settingsPanel = document.getElementById('settingsPanel');
        const closeSettings = document.getElementById('closeSettings');
        const settingsOverlay = document.querySelector('.settings-overlay');
        const settingsOK = document.getElementById('settingsOK');
        const settingsCancel = document.getElementById('settingsCancel');
        const settingsApply = document.getElementById('settingsApply');
        
        // 关闭设置面板
        const closePanel = () => {
            settingsPanel.classList.remove('active');
        };
        
        closeSettings.addEventListener('click', closePanel);
        settingsOverlay.addEventListener('click', closePanel);
        settingsCancel.addEventListener('click', () => {
            if (this.hotkeysDraft && JSON.stringify(this.hotkeysDraft) !== JSON.stringify(this.hotkeys)) {
                this.hotkeysDraft = { ...this.hotkeys };
                this.showNotification('热键修改已取消，未保存任何更改', 'warning');
            }
            closePanel();
        });
        
        // 确定按钮
        settingsOK.addEventListener('click', () => {
            this.applySettings();
            if (this.hotkeysDraft) {
                const changed = JSON.stringify(this.hotkeysDraft) !== JSON.stringify(this.hotkeys);
                this.hotkeys = { ...this.hotkeysDraft };
                this.saveHotkeys();
                if (changed) {
                    this.showNotification('热键设置已保存', 'success');
                }
            }
            this.savePlaybackSettings();
            closePanel();
        });
        
        // 应用按钮
        settingsApply.addEventListener('click', () => {
            this.applySettings();
            if (this.hotkeysDraft) {
                const changed = JSON.stringify(this.hotkeysDraft) !== JSON.stringify(this.hotkeys);
                this.hotkeys = { ...this.hotkeysDraft };
                this.saveHotkeys();
                if (changed) {
                    this.showNotification('热键设置已保存', 'success');
                }
            }
            this.savePlaybackSettings();
        });
        
        // 标签切换
        document.querySelectorAll('.settings-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                
                // 更新标签高亮
                document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                // 切换侧边栏
                const generalSidebar = document.getElementById('generalSidebar');
                const playbackSidebar = document.getElementById('playbackSidebar');
                
                if (tabName === 'general') {
                    generalSidebar.style.display = 'block';
                    playbackSidebar.style.display = 'none';
                    // 显示第一个常规设置项
                    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
                    document.getElementById('section-list').classList.add('active');
                    document.querySelectorAll('#generalSidebar .sidebar-item').forEach(i => i.classList.remove('active'));
                    document.querySelector('#generalSidebar .sidebar-item').classList.add('active');
                } else if (tabName === 'playback') {
                    generalSidebar.style.display = 'none';
                    playbackSidebar.style.display = 'block';
                    // 显示基本播放设置
                    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
                    document.getElementById('section-playback-basic').classList.add('active');
                    document.querySelectorAll('#playbackSidebar .sidebar-item').forEach(i => i.classList.remove('active'));
                    document.querySelector('#playbackSidebar .sidebar-item').classList.add('active');
                }
                
                console.log('切换到标签:', tabName);
            });
        });
        
        // 侧边栏导航
        document.querySelectorAll('.sidebar-item').forEach(item => {
            item.addEventListener('click', () => {
                const section = item.dataset.section;
                
                // 更新侧边栏高亮
                document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                
                // 显示对应内容区域
                document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
                document.getElementById('section-' + section).classList.add('active');
                
                // 切换到「文件关联」时重新检查默认播放器状态，以便与系统设置同步
                if (section === 'file-association') {
                    this.updateDefaultPlayerStatus();
                }
                
                console.log('切换到设置项:', section);
            });
        });
        
        // 窗口重新获得焦点时，若设置面板已打开则重新检查默认播放器状态（用户可能在系统设置中已设为默认）
        window.addEventListener('focus', () => {
            if (settingsPanel.classList.contains('active')) {
                this.updateDefaultPlayerStatus();
            }
        });
        
        // 文字大小选择联动
        const textSizeRadios = document.querySelectorAll('input[name="text-size"]');
        const textSizeSelect = document.getElementById('textSizeSelect');
        
        textSizeRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                const isManual = e.target.value === 'manual';
                textSizeSelect.disabled = !isManual;
                
                if (!isManual) {
                    // 自动模式：恢复默认字体大小
                    this.applyTextSize('14');
                }
            });
        });
        
        // 字体大小实时调节
        textSizeSelect.addEventListener('change', (e) => {
            const size = e.target.value;
            this.applyTextSize(size);
            console.log('实时调节字体大小:', size + 'px');
        });
        
        // 列表显示模式
        document.querySelectorAll('input[name="list-display"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                console.log('列表展现模式:', e.target.value);
            });
        });
        
        // 生成热键表格
        this.generateHotkeyTable();
        
        // 数字输入控制（通用）
        this.initNumberControls();
        
        // 播放设置选项
        this.initPlaybackSettings();
        
        // 截图设置
        this.initScreenshotSettings();
    }

    openSettings() {
        const settingsPanel = document.getElementById('settingsPanel');
        settingsPanel.classList.add('active');
        console.log('打开设置面板');
        
        // 加载保存的设置到界面
        this.loadPlayerSettings();
        this.loadPlaybackSettings();
        this.generateHotkeyTable();

        // 更新默认播放器状态
        this.updateDefaultPlayerStatus();
    }

    loadPlayerSettings() {
        try {
            const settings = JSON.parse(localStorage.getItem('player_settings') || '{}');
            
            // 恢复列表展现设置
            if (settings.listDisplay) {
                const radio = document.querySelector(`input[name="list-display"][value="${settings.listDisplay}"]`);
                if (radio) radio.checked = true;
            }
            
            // 恢复文字大小设置
            if (settings.textSize) {
                const radio = document.querySelector(`input[name="text-size"][value="${settings.textSize}"]`);
                if (radio) radio.checked = true;
            }
            
            if (settings.textSizeValue) {
                const select = document.getElementById('textSizeSelect');
                if (select) {
                    select.value = settings.textSizeValue;
                    // 应用保存的字体大小
                    if (settings.textSize === 'manual') {
                        this.applyTextSize(settings.textSizeValue);
                    }
                }
            }
            
            // 更新下拉框状态
            const textSizeSelect = document.getElementById('textSizeSelect');
            const isManual = settings.textSize === 'manual';
            if (textSizeSelect) {
                textSizeSelect.disabled = !isManual;
            }
            
        } catch (e) {
            console.error('加载播放器设置失败:', e);
        }
    }

    loadSavedPlayerSettings() {
        // 页面加载时应用保存的设置
        try {
            const settings = JSON.parse(localStorage.getItem('player_settings') || '{}');
            
            // 应用字体大小
            if (settings.textSize === 'manual' && settings.textSizeValue) {
                this.applyTextSize(settings.textSizeValue);
            }
            
            // 应用列表展现设置
            if (settings.listDisplay) {
                if (settings.listDisplay === 'always-expand') {
                    this.playlistPanel.classList.remove('hidden');
                } else if (settings.listDisplay === 'always-close') {
                    this.playlistPanel.classList.add('hidden');
                }
            }
            
        } catch (e) {
            console.error('加载保存的设置失败:', e);
        }
    }

    applyTextSize(size) {
        // 立即应用字体大小到播放列表
        const playlistItems = document.querySelectorAll('.playlist-item-name');
        const playlistInfo = document.querySelectorAll('.playlist-item-info');
        
        playlistItems.forEach(item => {
            item.style.fontSize = size + 'px';
        });
        
        playlistInfo.forEach(info => {
            info.style.fontSize = Math.max(11, parseInt(size) - 3) + 'px';
        });
        
        // 同时更新CSS变量（用于新添加的项目）
        document.documentElement.style.setProperty('--playlist-font-size', size + 'px');
        document.documentElement.style.setProperty('--playlist-info-font-size', Math.max(11, parseInt(size) - 3) + 'px');
    }

    applySettings() {
        // 获取所有设置
        const listDisplay = document.querySelector('input[name="list-display"]:checked')?.value;
        const textSize = document.querySelector('input[name="text-size"]:checked')?.value;
        const textSizeValue = document.getElementById('textSizeSelect')?.value;
        
        // 保存设置
        const settings = {
            listDisplay,
            textSize,
            textSizeValue
        };
        
        try {
            localStorage.setItem('player_settings', JSON.stringify(settings));
            console.log('应用设置:', settings);
            
            // 应用列表区域设置
            if (listDisplay === 'always-expand') {
                this.playlistPanel.classList.remove('hidden');
            } else if (listDisplay === 'always-close') {
                this.playlistPanel.classList.add('hidden');
            }
            
            // 应用文字大小
            if (textSize === 'manual' && textSizeValue) {
                this.applyTextSize(textSizeValue);
            } else {
                // 自动模式，恢复默认
                this.applyTextSize('14');
            }
            
        } catch (e) {
            console.error('保存设置失败:', e);
        }
    }

    // ========== 全景功能（已移除）==========
    initPanorama() {
        // 全景功能已移除，此函数不再使用
        return;
        // 获取canvas元素
        this.panoramaCanvas = document.getElementById('panoramaCanvas');
        if (this.panoramaCanvas) {
            this.panoramaCtx = this.panoramaCanvas.getContext('2d');
        }
        
        // 菜单栏全景选项
        const panoramaSphere = document.getElementById('panoramaSphere');
        const panoramaCube = document.getElementById('panoramaCube');
        const panoramaOff = document.getElementById('panoramaOff');
        
        if (panoramaSphere) {
            panoramaSphere.addEventListener('click', () => {
                this.setPanoramaMode('sphere');
            });
        }
        
        if (panoramaCube) {
            panoramaCube.addEventListener('click', () => {
                this.setPanoramaMode('cube');
            });
        }
        
        if (panoramaOff) {
            panoramaOff.addEventListener('click', () => {
                this.setPanoramaMode('off');
            });
        }
        
        // 右键菜单全景选项
        this.initContextPanoramaMenu();
        
        // 全景模式下的鼠标拖拽旋转
        this.initPanoramaDrag();
        
        console.log('全景功能初始化完成');
    }
    
    initContextPanoramaMenu() {
        // 监听右键菜单中的全景选项
        const contextItems = document.querySelectorAll('.context-item');
        contextItems.forEach(item => {
            const action = item.getAttribute('data-action');
            if (action && action.startsWith('panorama-')) {
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const mode = action.replace('panorama-', '');
                    this.setPanoramaMode(mode);
                    document.getElementById('contextMenu').classList.remove('active');
                });
            }
        });
    }
    
    setPanoramaMode(mode) {
        console.log('设置全景模式:', mode);
        
        // 停止之前的动画
        if (this.panoramaAnimationId) {
            cancelAnimationFrame(this.panoramaAnimationId);
            this.panoramaAnimationId = null;
        }
        
        this.panoramaMode = mode;
        
        // 重置旋转角度
        this.panoramaRotation = { x: 0, y: 0 };
        
        if (mode === 'off') {
            // 关闭全景模式
            if (this.panoramaCanvas) {
                this.panoramaCanvas.classList.remove('active');
                this.panoramaCanvas.style.display = 'none';
            }
            this.videoArea.classList.remove('panorama-active');
            this.video.style.opacity = '1';
            this.video.style.pointerEvents = 'auto';
            
            // 清理WebGL资源
            if (this.panoramaGL) {
                const gl = this.panoramaGL;
                if (this.panoramaTexture) {
                    gl.deleteTexture(this.panoramaTexture);
                    this.panoramaTexture = null;
                }
                if (this.panoramaPositionBuffer) {
                    gl.deleteBuffer(this.panoramaPositionBuffer);
                    this.panoramaPositionBuffer = null;
                }
                if (this.panoramaProgram) {
                    gl.deleteProgram(this.panoramaProgram);
                    this.panoramaProgram = null;
                }
                this.panoramaGL = null;
            }
            
            // 恢复原有的变换和滤镜
            this.applyTransform();
            this.applyFilters();
            
            this.showMessage('全景模式已关闭', 'info');
            console.log('全景模式已关闭');
        } else if (mode === 'sphere') {
            // 球面全景模式
            this.startPanoramaRendering();
            this.showMessage('球面全景模式已启用，可拖拽视频旋转视角', 'success');
            console.log('球面全景模式已启用');
        } else if (mode === 'cube') {
            // 立方体全景模式
            this.startPanoramaRendering();
            this.showMessage('立方体全景模式已启用，可拖拽视频旋转视角', 'success');
            console.log('立方体全景模式已启用');
        }
    }
    
    startPanoramaRendering() {
        if (!this.panoramaCanvas) {
            console.error('全景画布未初始化');
            return;
        }
        
        // 显示canvas，隐藏video
        this.panoramaCanvas.classList.add('active');
        this.panoramaCanvas.style.display = 'block';
        this.videoArea.classList.add('panorama-active');
        
        // 设置canvas尺寸
        this.resizePanoramaCanvas();
        
        // 尝试初始化WebGL GPU加速（仅球面全景）
        if (this.useWebGL && this.panoramaMode === 'sphere') {
            const webglSuccess = this.initPanoramaWebGL();
            if (webglSuccess) {
                console.log('🚀 使用WebGL GPU加速渲染 - 流畅60fps');
            } else {
                console.log('⚠️ 降级到Canvas 2D渲染');
                if (!this.panoramaCtx) {
                    this.panoramaCtx = this.panoramaCanvas.getContext('2d');
                }
            }
        } else {
            // 立方体模式或手动禁用WebGL
            if (!this.panoramaCtx) {
                this.panoramaCtx = this.panoramaCanvas.getContext('2d');
            }
        }
        
        // 开始渲染循环
        this.renderPanorama();
    }
    
    resizePanoramaCanvas() {
        if (!this.panoramaCanvas) return;
        
        const rect = this.videoArea.getBoundingClientRect();
        this.panoramaCanvas.width = rect.width;
        this.panoramaCanvas.height = rect.height;
    }
    
    // ========== WebGL GPU加速渲染 ==========
    initPanoramaWebGL() {
        if (!this.panoramaCanvas) return false;
        
        try {
            // 尝试获取WebGL上下文
            this.panoramaGL = this.panoramaCanvas.getContext('webgl', {
                antialias: true,
                alpha: false,
                premultipliedAlpha: false
            }) || this.panoramaCanvas.getContext('experimental-webgl', {
                antialias: true,
                alpha: false,
                premultipliedAlpha: false
            });
            
            if (!this.panoramaGL) {
                console.warn('WebGL不可用，降级到Canvas 2D');
                return false;
            }
            
            const gl = this.panoramaGL;
            
            // 顶点着色器（覆盖整个canvas）
            const vertexShaderSource = `
                attribute vec2 a_position;
                varying vec2 v_texCoord;
                
                void main() {
                    gl_Position = vec4(a_position, 0.0, 1.0);
                    v_texCoord = a_position * 0.5 + 0.5;
                }
            `;
            
            // 片段着色器（球面全景映射）
            const fragmentShaderSource = `
                precision highp float;
                
                uniform sampler2D u_texture;
                uniform vec2 u_resolution;
                uniform float u_rotX;
                uniform float u_rotY;
                uniform float u_fov;
                
                varying vec2 v_texCoord;
                
                const float PI = 3.14159265359;
                
                void main() {
                    // 屏幕坐标转换到-1到1
                    vec2 screenPos = v_texCoord * 2.0 - 1.0;
                    screenPos.y *= u_resolution.y / u_resolution.x;
                    
                    // 计算到中心的距离
                    float r = length(screenPos);
                    
                    // 超出球面范围显示黑色
                    if (r > 1.0) {
                        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
                        return;
                    }
                    
                    // 球面投影
                    float theta = atan(screenPos.y, screenPos.x);
                    float phi = r * (u_fov * 0.5);
                    
                    // 转换为3D笛卡尔坐标
                    float sinPhi = sin(phi);
                    float cosPhi = cos(phi);
                    vec3 dir = vec3(
                        sinPhi * cos(theta),
                        sinPhi * sin(theta),
                        cosPhi
                    );
                    
                    // 应用旋转（Y轴 - 水平旋转）
                    float cosY = cos(u_rotY);
                    float sinY = sin(u_rotY);
                    vec3 dir1 = vec3(
                        dir.x * cosY - dir.z * sinY,
                        dir.y,
                        dir.x * sinY + dir.z * cosY
                    );
                    
                    // 应用旋转（X轴 - 垂直旋转）
                    float cosX = cos(u_rotX);
                    float sinX = sin(u_rotX);
                    vec3 dir2 = vec3(
                        dir1.x,
                        dir1.y * cosX - dir1.z * sinX,
                        dir1.y * sinX + dir1.z * cosX
                    );
                    
                    // 映射回纹理坐标（等距柱状投影）
                    float longitude = atan(dir2.x, dir2.z);
                    float latitude = asin(clamp(dir2.y, -1.0, 1.0));
                    
                    vec2 texCoord = vec2(
                        (longitude / PI + 1.0) * 0.5,
                        latitude / PI + 0.5
                    );
                    
                    // 采样视频纹理
                    gl_FragColor = texture2D(u_texture, texCoord);
                }
            `;
            
            // 编译着色器
            const vertexShader = this.compileShader(gl, vertexShaderSource, gl.VERTEX_SHADER);
            const fragmentShader = this.compileShader(gl, fragmentShaderSource, gl.FRAGMENT_SHADER);
            
            if (!vertexShader || !fragmentShader) {
                console.error('着色器编译失败');
                return false;
            }
            
            // 创建程序
            const program = gl.createProgram();
            gl.attachShader(program, vertexShader);
            gl.attachShader(program, fragmentShader);
            gl.linkProgram(program);
            
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                console.error('程序链接失败:', gl.getProgramInfoLog(program));
                return false;
            }
            
            this.panoramaProgram = program;
            gl.useProgram(program);
            
            // 创建全屏四边形
            const positions = new Float32Array([
                -1, -1,
                 1, -1,
                -1,  1,
                 1,  1,
            ]);
            
            this.panoramaPositionBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this.panoramaPositionBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
            
            const positionLocation = gl.getAttribLocation(program, 'a_position');
            gl.enableVertexAttribArray(positionLocation);
            gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
            
            // 创建纹理
            this.panoramaTexture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, this.panoramaTexture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            
            console.log('✅ WebGL GPU加速已启用 - 性能提升50-100倍');
            return true;
            
        } catch (e) {
            console.error('WebGL初始化失败:', e);
            this.panoramaGL = null;
            return false;
        }
    }
    
    // 编译着色器
    compileShader(gl, source, type) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('着色器编译错误:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        
        return shader;
    }
    
    // WebGL渲染球面全景（GPU加速）
    renderSpherePanoramaWebGL(video, canvas) {
        const gl = this.panoramaGL;
        if (!gl || !this.panoramaProgram) return;
        
        try {
            // 设置视口
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.clearColor(0, 0, 0, 1);
            gl.clear(gl.COLOR_BUFFER_BIT);
            
            // 使用程序
            gl.useProgram(this.panoramaProgram);
            
            // 绑定缓冲区
            gl.bindBuffer(gl.ARRAY_BUFFER, this.panoramaPositionBuffer);
            const positionLocation = gl.getAttribLocation(this.panoramaProgram, 'a_position');
            gl.enableVertexAttribArray(positionLocation);
            gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
            
            // 更新视频纹理
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.panoramaTexture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
            
            // 设置uniform变量
            const textureLocation = gl.getUniformLocation(this.panoramaProgram, 'u_texture');
            const resolutionLocation = gl.getUniformLocation(this.panoramaProgram, 'u_resolution');
            const rotXLocation = gl.getUniformLocation(this.panoramaProgram, 'u_rotX');
            const rotYLocation = gl.getUniformLocation(this.panoramaProgram, 'u_rotY');
            const fovLocation = gl.getUniformLocation(this.panoramaProgram, 'u_fov');
            
            gl.uniform1i(textureLocation, 0);
            gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
            gl.uniform1f(rotXLocation, this.panoramaRotation.x * Math.PI / 180);
            gl.uniform1f(rotYLocation, this.panoramaRotation.y * Math.PI / 180);
            gl.uniform1f(fovLocation, 120 * Math.PI / 180);
            
            // 绘制全屏四边形
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            
        } catch (e) {
            console.error('WebGL渲染错误:', e);
            // 渲染失败，禁用WebGL
            this.panoramaGL = null;
        }
    }
    
    renderPanorama() {
        if (this.panoramaMode === 'off') return;
        
        if (!this.video.videoWidth) {
            this.panoramaAnimationId = requestAnimationFrame(() => this.renderPanorama());
            return;
        }
        
        const canvas = this.panoramaCanvas;
        const video = this.video;
        
        // 优先使用WebGL GPU加速渲染（性能提升50-100倍）
        if (this.panoramaGL && this.panoramaMode === 'sphere') {
            this.renderSpherePanoramaWebGL(video, canvas);
        } else if (this.panoramaCtx) {
            // 降级到Canvas 2D（立方体模式或WebGL不可用）
            const ctx = this.panoramaCtx;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            if (this.panoramaMode === 'sphere') {
                this.renderSpherePanorama(ctx, video, canvas);
            } else if (this.panoramaMode === 'cube') {
                this.renderCubePanorama(ctx, video, canvas);
            }
        }
        
        // 继续下一帧
        this.panoramaAnimationId = requestAnimationFrame(() => this.renderPanorama());
    }
    
    renderCubePanorama(ctx, video, canvas) {
        // 立方体全景：实现立方体映射投影效果
        const width = canvas.width;
        const height = canvas.height;
        
        // 旋转角度
        const rotX = this.panoramaRotation.x * Math.PI / 180;
        const rotY = this.panoramaRotation.y * Math.PI / 180;
        
        ctx.save();
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);
        
        // 网格渲染
        const gridSize = 60;
        const fov = 90 * Math.PI / 180; // 90度视场角
        
        for (let i = 0; i < gridSize; i++) {
            for (let j = 0; j < gridSize; j++) {
                // 屏幕坐标（归一化到-1到1）
                const screenX = (i / gridSize) * 2 - 1;
                const screenY = (j / gridSize) * 2 - 1;
                
                // 透视投影：从屏幕坐标到3D方向
                const tanFov = Math.tan(fov / 2);
                let x = screenX * tanFov;
                let y = -screenY * tanFov;
                let z = 1;
                
                // 归一化方向向量
                const length = Math.sqrt(x * x + y * y + z * z);
                x /= length;
                y /= length;
                z /= length;
                
                // 应用旋转变换
                // 绕Y轴旋转（水平）
                const cosY = Math.cos(rotY);
                const sinY = Math.sin(rotY);
                const x1 = x * cosY + z * sinY;
                const z1 = -x * sinY + z * cosY;
                
                // 绕X轴旋转（垂直）
                const cosX = Math.cos(rotX);
                const sinX = Math.sin(rotX);
                const y2 = y * cosX - z1 * sinX;
                const z2 = y * sinX + z1 * cosX;
                
                // 立方体映射：将3D方向映射到立方体的6个面
                const absX = Math.abs(x1);
                const absY = Math.abs(y2);
                const absZ = Math.abs(z2);
                
                let u, v;
                const maxAxis = Math.max(absX, absY, absZ);
                
                if (maxAxis === absX) {
                    // 左/右面
                    if (x1 > 0) {
                        // 右面
                        u = (-z2 / absX + 1) / 2;
                        v = (-y2 / absX + 1) / 2;
                    } else {
                        // 左面
                        u = (z2 / absX + 1) / 2;
                        v = (-y2 / absX + 1) / 2;
                    }
                } else if (maxAxis === absY) {
                    // 上/下面
                    if (y2 > 0) {
                        // 上面
                        u = (x1 / absY + 1) / 2;
                        v = (z2 / absY + 1) / 2;
                    } else {
                        // 下面
                        u = (x1 / absY + 1) / 2;
                        v = (-z2 / absY + 1) / 2;
                    }
                } else {
                    // 前/后面
                    if (z2 > 0) {
                        // 前面
                        u = (x1 / absZ + 1) / 2;
                        v = (-y2 / absZ + 1) / 2;
                    } else {
                        // 后面
                        u = (-x1 / absZ + 1) / 2;
                        v = (-y2 / absZ + 1) / 2;
                    }
                }
                
                // 应用桶形畸变增强立方体效果
                const distFromCenter = Math.sqrt(
                    (u - 0.5) * (u - 0.5) + (v - 0.5) * (v - 0.5)
                );
                const distortionStrength = 0.3;
                const distortionFactor = 1 + distFromCenter * distortionStrength;
                u = 0.5 + (u - 0.5) * distortionFactor;
                v = 0.5 + (v - 0.5) * distortionFactor;
                
                // 确保坐标在有效范围内
                u = Math.max(0, Math.min(1, u));
                v = Math.max(0, Math.min(1, v));
                
                // 转换为视频像素坐标
                const srcX = u * video.videoWidth;
                const srcY = v * video.videoHeight;
                
                // 目标屏幕坐标
                const destX = (screenX + 1) / 2 * width;
                const destY = (screenY + 1) / 2 * height;
                
                // 绘制像素块
                const blockSize = width / gridSize;
                try {
                    ctx.drawImage(
                        video,
                        Math.floor(srcX), Math.floor(srcY),
                        Math.max(1, video.videoWidth / gridSize),
                        Math.max(1, video.videoHeight / gridSize),
                        Math.floor(destX), Math.floor(destY),
                        Math.ceil(blockSize * 1.05), Math.ceil(blockSize * 1.05)
                    );
                } catch (e) {
                    // 忽略越界错误
                }
            }
        }
        
        ctx.restore();
    }
    
    renderSpherePanorama(ctx, video, canvas) {
        // 球面全景：实现球面/鱼眼扭曲效果
        const width = canvas.width;
        const height = canvas.height;
        
        // 旋转角度
        const rotX = this.panoramaRotation.x * Math.PI / 180;
        const rotY = this.panoramaRotation.y * Math.PI / 180;
        
        ctx.save();
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);
        
        // 球面映射参数
        const gridSize = 80; // 更高的网格密度以获得更平滑的效果
        const fov = 120 * Math.PI / 180; // 视场角，120度产生类似鱼眼的效果
        const sphereRadius = 1.0; // 球面半径
        
        for (let i = 0; i < gridSize; i++) {
            for (let j = 0; j < gridSize; j++) {
                // 屏幕坐标（归一化到-1到1）
                const screenX = (i / gridSize) * 2 - 1;
                const screenY = (j / gridSize) * 2 - 1;
                
                // 计算从中心的距离（用于球面映射）
                const r = Math.sqrt(screenX * screenX + screenY * screenY);
                
                // 如果超出球面范围，跳过
                if (r > 1.0) continue;
                
                // 球面投影：将2D屏幕坐标映射到3D球面
                // 使用球面坐标系统
                const theta = Math.atan2(screenY, screenX); // 方位角
                const phi = r * (fov / 2); // 极角（基于距离中心的距离）
                
                // 转换为3D笛卡尔坐标
                const sinPhi = Math.sin(phi);
                const cosPhi = Math.cos(phi);
                let x = sinPhi * Math.cos(theta);
                let y = sinPhi * Math.sin(theta);
                let z = cosPhi;
                
                // 应用旋转变换
                // 绕Y轴旋转（水平旋转）
                const cosY = Math.cos(rotY);
                const sinY = Math.sin(rotY);
                const x1 = x * cosY - z * sinY;
                const z1 = x * sinY + z * cosY;
                
                // 绕X轴旋转（垂直旋转）
                const cosX = Math.cos(rotX);
                const sinX = Math.sin(rotX);
                const y2 = y * cosX - z1 * sinX;
                const z2 = y * sinX + z1 * cosX;
                
                // 将旋转后的3D坐标映射回球面纹理坐标
                // 使用等距柱状投影（equirectangular projection）
                const longitude = Math.atan2(x1, z2);
                const latitude = Math.asin(Math.max(-1, Math.min(1, y2)));
                
                // 转换为纹理坐标 (0到1)
                let u = (longitude / Math.PI + 1) / 2;
                let v = (latitude / Math.PI + 0.5);
                
                // 确保纹理坐标在有效范围内
                u = ((u % 1) + 1) % 1; // 处理水平环绕
                v = Math.max(0, Math.min(1, v));
                
                // 转换为视频像素坐标
                const srcX = u * video.videoWidth;
                const srcY = v * video.videoHeight;
                
                // 目标屏幕坐标
                const destX = (screenX + 1) / 2 * width;
                const destY = (screenY + 1) / 2 * height;
                
                // 绘制像素块
                const blockSize = width / gridSize;
                try {
                    ctx.drawImage(
                        video,
                        Math.floor(srcX), Math.floor(srcY),
                        Math.max(1, video.videoWidth / gridSize),
                        Math.max(1, video.videoHeight / gridSize),
                        Math.floor(destX), Math.floor(destY),
                        Math.ceil(blockSize * 1.2), Math.ceil(blockSize * 1.2)
                    );
                } catch (e) {
                    // 忽略越界错误
                }
            }
        }
        
        ctx.restore();
    }
    
    renderCubePanorama(ctx, video, canvas) {
        // 立方体全景：实现立方体映射投影效果
        const width = canvas.width;
        const height = canvas.height;
        
        // 旋转角度
        const rotX = this.panoramaRotation.x * Math.PI / 180;
        const rotY = this.panoramaRotation.y * Math.PI / 180;
        
        ctx.save();
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);
        
        // 网格渲染
        const gridSize = 60;
        
        for (let i = 0; i < gridSize; i++) {
            for (let j = 0; j < gridSize; j++) {
                // 屏幕坐标（归一化到-1到1）
                const screenX = (i / gridSize) * 2 - 1;
                const screenY = (j / gridSize) * 2 - 1;
                
                // 立方体投影：屏幕坐标到3D方向向量
                // 假设观察者在立方体中心向外看
                const distance = 1.5; // 观察距离
                let x = screenX * distance;
                let y = -screenY * distance;
                let z = distance;
                
                // 应用旋转变换
                // 绕Y轴旋转（水平）
                const cosY = Math.cos(rotY);
                const sinY = Math.sin(rotY);
                const x1 = x * cosY + z * sinY;
                const z1 = -x * sinY + z * cosY;
                
                // 绕X轴旋转（垂直）
                const cosX = Math.cos(rotX);
                const sinX = Math.sin(rotX);
                const y2 = y * cosX - z1 * sinX;
                const z2 = y * sinX + z1 * cosX;
                
                // 立方体面映射：将3D方向映射到纹理坐标
                const absX = Math.abs(x1);
                const absY = Math.abs(y2);
                const absZ = Math.abs(z2);
                
                let u, v;
                
                // 确定击中哪个立方体面并计算纹理坐标
                if (absZ >= absX && absZ >= absY) {
                    // 前/后面
                    if (z2 > 0) {
                        u = (x1 / z2 + 1) / 2;
                        v = (-y2 / z2 + 1) / 2;
                    } else {
                        u = (-x1 / -z2 + 1) / 2;
                        v = (-y2 / -z2 + 1) / 2;
                    }
                } else if (absX >= absY && absX >= absZ) {
                    // 左/右面
                    if (x1 > 0) {
                        u = (z2 / x1 + 1) / 2;
                        v = (-y2 / x1 + 1) / 2;
                    } else {
                        u = (-z2 / -x1 + 1) / 2;
                        v = (-y2 / -x1 + 1) / 2;
                    }
                } else {
                    // 上/下面
                    if (y2 > 0) {
                        u = (x1 / y2 + 1) / 2;
                        v = (z2 / y2 + 1) / 2;
                    } else {
                        u = (x1 / -y2 + 1) / 2;
                        v = (-z2 / -y2 + 1) / 2;
                    }
                }
                
                // 确保纹理坐标在有效范围内
                u = Math.max(0, Math.min(1, u));
                v = Math.max(0, Math.min(1, v));
                
                // 转换为视频像素坐标
                const srcX = u * video.videoWidth;
                const srcY = v * video.videoHeight;
                
                // 目标屏幕坐标
                const destX = (screenX + 1) / 2 * width;
                const destY = (screenY + 1) / 2 * height;
                
                // 绘制像素块
                const blockSize = width / gridSize;
                try {
                    ctx.drawImage(
                        video,
                        Math.floor(srcX), Math.floor(srcY),
                        Math.max(1, video.videoWidth / gridSize),
                        Math.max(1, video.videoHeight / gridSize),
                        Math.floor(destX), Math.floor(destY),
                        Math.ceil(blockSize * 1.1), Math.ceil(blockSize * 1.1)
                    );
                } catch (e) {
                    // 忽略越界错误
                }
            }
        }
        
        ctx.restore();
    }
    
    initPanoramaDrag() {
        // 为canvas添加拖拽事件
        if (!this.panoramaCanvas) return;
        
        this.panoramaCanvas.addEventListener('mousedown', (e) => {
            if (this.panoramaMode !== 'off') {
                this.isPanoramaDragging = true;
                this.panoramaLastPos = { x: e.clientX, y: e.clientY };
                this.panoramaCanvas.classList.add('dragging');
                e.preventDefault();
            }
        });
        
        document.addEventListener('mousemove', (e) => {
            if (this.isPanoramaDragging && this.panoramaMode !== 'off') {
                const deltaX = e.clientX - this.panoramaLastPos.x;
                const deltaY = e.clientY - this.panoramaLastPos.y;
                
                // 根据鼠标移动更新旋转角度
                this.panoramaRotation.y += deltaX * 0.5;
                this.panoramaRotation.x -= deltaY * 0.5;
                
                // 限制X轴旋转角度
                this.panoramaRotation.x = Math.max(-85, Math.min(85, this.panoramaRotation.x));
                
                this.panoramaLastPos = { x: e.clientX, y: e.clientY };
                e.preventDefault();
            }
        });
        
        document.addEventListener('mouseup', () => {
            if (this.isPanoramaDragging) {
                this.isPanoramaDragging = false;
                if (this.panoramaCanvas) {
                    this.panoramaCanvas.classList.remove('dragging');
                }
            }
        });
        
        // 窗口大小改变时重新调整canvas
        window.addEventListener('resize', () => {
            if (this.panoramaMode !== 'off') {
                this.resizePanoramaCanvas();
            }
        });
    }
}

Object.assign(BaofengPlayer.prototype, resumeMixin, playlistMixin, dlnaMixin, hotkeysMixin, pipMixin, abLoopMixin, favoritesMixin, recentMixin);
