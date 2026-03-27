/**
 * 鲲穹AI播放器 - 应用入口 (模块化)
 */
import { Logger } from './modules/logger.js';
import { i18n } from './modules/i18n.js';
import { BaofengPlayer } from '../script.js';

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await i18n.init();
        const player = new BaofengPlayer();
        player.i18n = i18n;
        window.baofengPlayer = player;
        Logger.info('鲲穹AI播放器已启动 (模块化模式)');
    } catch (error) {
        Logger.error('应用启动失败:', error);
        console.error('鲲穹影音启动失败，请打开开发者工具查看详情:', error);
        if (typeof alert === 'function') {
            alert('启动失败: ' + (error && error.message ? error.message : String(error)));
        }
    }
});
