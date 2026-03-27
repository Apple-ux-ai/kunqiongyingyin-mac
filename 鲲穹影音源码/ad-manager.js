/**
 * 广告管理器 - 处理广告获取、渲染和点击跳转
 * 基于《接入文档.md》中的“3. 鲲穹软件广告功能接口”实现
 */

/** 是否展示广告位：设为 false 暂时隐藏，设为 true 可重新展示 */
const SHOW_ADS = false;

class AdManager {
    constructor() {
        this.API_BASE_URL = 'https://api-web.kunqiongai.com';
        this.SOFT_NUMBER = '10019'; // 默认软件编号
        this.POSITIONS = {
            TITLE_BAR: 'adv_position_01',
            PLAYLIST_02: 'adv_position_02',
            PLAYLIST_03: 'adv_position_03'
        };
        
        // 容器映射
        this.containers = {
            [this.POSITIONS.TITLE_BAR]: 'titleAd',
            'PLAYLIST_GROUP': 'playlistAd'
        };

        // 轮播状态存储
        this.carouselState = {
            [this.POSITIONS.TITLE_BAR]: {
                ads: [],
                currentIndex: 0,
                intervalId: null,
                isPaused: false
            },
            'PLAYLIST_GROUP': {
                ads: [],
                currentIndex: 0,
                intervalId: null,
                isPaused: false
            }
        };

        this.CAROUSEL_INTERVAL = 5000; // 轮播间隔 5 秒
    }

    /**
     * 隐藏所有广告位容器（不占位）
     */
    hideAdContainers() {
        const titleEl = document.getElementById('titleAd');
        const playlistEl = document.getElementById('playlistAd');
        if (titleEl) titleEl.style.display = 'none';
        if (playlistEl) playlistEl.style.display = 'none';
    }

    /**
     * 初始化广告位
     */
    async init() {
        if (!SHOW_ADS) {
            console.log('[AdManager] 广告位已关闭，不加载广告');
            this.hideAdContainers();
            return;
        }
        console.log('[AdManager] 正在初始化广告功能...');
        
        // 加载标题栏广告
        this.loadAd(this.POSITIONS.TITLE_BAR);
        
        // 加载播放列表广告 (合并 02 和 03)
        this.loadPlaylistAds();
    }

    /**
     * 加载播放列表合并广告 (adv_position_02 + adv_position_03)
     */
    async loadPlaylistAds() {
        const positionKey = 'PLAYLIST_GROUP';
        try {
            // 并行获取两个位置的数据
            const [data02, data03] = await Promise.all([
                this.fetchAdData(this.POSITIONS.PLAYLIST_02),
                this.fetchAdData(this.POSITIONS.PLAYLIST_03)
            ]);

            let combinedAds = [...(data02 || []), ...(data03 || [])];
            
            // 调试模式：如果只有一条广告，复制一份以演示轮播效果
            if (combinedAds.length === 1) {
                console.log(`[AdManager] 调试模式: 为播放列表复制广告以演示轮播`);
                combinedAds.push({...combinedAds[0], isClone: true});
            }

            if (combinedAds.length > 0) {
                this.carouselState[positionKey].ads = combinedAds;
                this.renderAd(positionKey, combinedAds);
                
                if (combinedAds.length > 1) {
                    this.startCarousel(positionKey);
                }
            }
        } catch (error) {
            console.error(`[AdManager] 加载播放列表广告失败:`, error);
        }
    }

    /**
     * 加载指定位置的广告
     * @param {string} position 广告位置 ID
     */
    async loadAd(position) {
        try {
            let adData = await this.fetchAdData(position);
            
            // 调试模式：如果只有一条广告，复制一份以演示轮播效果
            if (adData && adData.length === 1) {
                console.log(`[AdManager] 调试模式: 为位置 ${position} 复制广告以演示轮播`);
                adData.push({...adData[0], isClone: true});
            }

            if (adData && adData.length > 0) {
                this.carouselState[position].ads = adData;
                this.renderAd(position, adData);
                
                // 如果有多条广告，开启轮播
                if (adData.length > 1) {
                    this.startCarousel(position);
                }
            } else {
                console.warn(`[AdManager] 未获取到广告数据: ${position}`);
            }
        } catch (error) {
            console.error(`[AdManager] 加载广告失败 (${position}):`, error);
        }
    }

    /**
     * 从 API 获取广告数据
     * @param {string} position 广告位置 ID
     */
    async fetchAdData(position) {
        const url = `${this.API_BASE_URL}/soft_desktop/get_adv`;
        const params = new URLSearchParams();
        params.append('soft_number', this.SOFT_NUMBER);
        params.append('adv_position', position);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params
        });

        const result = await response.json();
        if (result.code === 1) {
            return result.data;
        } else {
            throw new Error(result.msg || '获取广告数据失败');
        }
    }

    /**
     * 渲染广告到页面
     * @param {string} position 广告位置 ID
     * @param {Array} ads 广告对象数据列表
     */
    renderAd(position, ads) {
        const containerId = this.containers[position];
        const container = document.getElementById(containerId);
        if (!container) return;

        // 根据位置类型采用不同的渲染方式
        if (position === this.POSITIONS.TITLE_BAR) {
            this.renderTitleAd(container, ads);
        } else if (position === 'PLAYLIST_GROUP') {
            this.renderPlaylistAd(container, ads);
        }
    }

    /**
     * 渲染标题栏广告
     */
    renderTitleAd(container, ads) {
        container.innerHTML = ads.map((ad, index) => `
            <img src="${ad.adv_url}" class="${index === 0 ? 'active' : ''}" alt="广告" data-target="${ad.target_url}">
        `).join('');
        
        container.title = '点击查看详情';
        container.onclick = (e) => {
            const activeImg = container.querySelector('img.active');
            if (activeImg) {
                const targetUrl = activeImg.getAttribute('data-target');
                this.handleAdClick(targetUrl);
            }
        };
        container.style.border = 'none'; 
        container.style.background = 'transparent';
    }

    /**
     * 渲染播放列表广告
     */
    renderPlaylistAd(container, ads) {
        const banner = container.querySelector('.ad-banner');
        if (!banner) return;

        // 1. 渲染广告图片
        banner.innerHTML = ads.map((ad, index) => `
            <img src="${ad.adv_url}" class="${index === 0 ? 'active' : ''}" alt="广告" data-target="${ad.target_url}">
        `).join('');

        // 2. 添加导航按钮 (默认隐藏，CSS 控制悬停显示)
        const prevBtn = document.createElement('div');
        prevBtn.className = 'ad-nav ad-prev';
        prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
        
        const nextBtn = document.createElement('div');
        nextBtn.className = 'ad-nav ad-next';
        nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';

        banner.appendChild(prevBtn);
        banner.appendChild(nextBtn);

        // 3. 添加底部指示点
        const dotsContainer = document.createElement('div');
        dotsContainer.className = 'ad-dots';
        dotsContainer.innerHTML = ads.map((_, index) => `
            <div class="ad-dot ${index === 0 ? 'active' : ''}" data-index="${index}"></div>
        `).join('');
        banner.appendChild(dotsContainer);

        // --- 绑定交互事件 ---
        const positionKey = 'PLAYLIST_GROUP';
        const state = this.carouselState[positionKey];

        // 点击跳转广告
        banner.onclick = (e) => {
            if (e.target.closest('.ad-nav') || e.target.closest('.ad-dot')) return;
            const activeImg = banner.querySelector('img.active');
            if (activeImg) {
                this.handleAdClick(activeImg.getAttribute('data-target'));
            }
        };

        // 导航按钮点击
        prevBtn.onclick = (e) => {
            e.stopPropagation();
            this.prevAd(positionKey);
        };
        nextBtn.onclick = (e) => {
            e.stopPropagation();
            this.nextAd(positionKey);
        };

        // 指示点点击
        dotsContainer.onclick = (e) => {
            const dot = e.target.closest('.ad-dot');
            if (dot) {
                e.stopPropagation();
                const index = parseInt(dot.getAttribute('data-index'));
                this.goToAd(positionKey, index);
            }
        };

        // 鼠标悬停暂停/恢复
        banner.onmouseenter = () => {
            state.isPaused = true;
        };
        banner.onmouseleave = () => {
            state.isPaused = false;
        };

        banner.style.border = 'none';
    }

    /**
     * 跳转到指定索引的广告
     */
    goToAd(position, index) {
        const state = this.carouselState[position];
        if (!state.ads || state.ads.length <= 1) return;

        const containerId = this.containers[position];
        let targetElement = document.getElementById(containerId);
        if (position === 'PLAYLIST_GROUP') {
            targetElement = targetElement ? targetElement.querySelector('.ad-banner') : null;
        }

        if (!targetElement) return;

        const imgs = targetElement.querySelectorAll('img');
        const dots = targetElement.querySelectorAll('.ad-dot');
        
        if (imgs.length === 0) return;

        // 切换类名
        imgs[state.currentIndex].classList.remove('active');
        if (dots[state.currentIndex]) dots[state.currentIndex].classList.remove('active');

        state.currentIndex = index;

        imgs[state.currentIndex].classList.add('active');
        if (dots[state.currentIndex]) dots[state.currentIndex].classList.add('active');
    }

    /**
     * 切换到上一条广告
     */
    prevAd(position) {
        const state = this.carouselState[position];
        const newIndex = (state.currentIndex - 1 + state.ads.length) % state.ads.length;
        this.goToAd(position, newIndex);
    }

    /**
     * 切换到下一条广告
     */
    nextAd(position) {
        const state = this.carouselState[position];
        if (state.isPaused) return;

        const newIndex = (state.currentIndex + 1) % state.ads.length;
        this.goToAd(position, newIndex);
    }

    /**
     * 开启轮播定时器
     */
    startCarousel(position) {
        if (this.carouselState[position].intervalId) {
            clearInterval(this.carouselState[position].intervalId);
        }

        this.carouselState[position].intervalId = setInterval(() => {
            this.nextAd(position);
        }, this.CAROUSEL_INTERVAL);
    }

    /**
     * 处理广告点击
     * @param {string} targetUrl 跳转地址
     */
    handleAdClick(targetUrl) {
        if (targetUrl && window.electronAPI && window.electronAPI.openExternal) {
            console.log(`[AdManager] 正在跳转到广告页面: ${targetUrl}`);
            window.electronAPI.openExternal(targetUrl);
        } else {
            console.warn('[AdManager] 无法打开外部链接或地址为空');
        }
    }
}

// 导出全局单例
window.adManager = new AdManager();

// 页面加载完成后自动初始化
document.addEventListener('DOMContentLoaded', () => {
    window.adManager.init();
});
