import { Logger } from './logger.js';
import zhCN from '../locales/zh-CN.js';
import enUS from '../locales/en-US.js';
import zhTW from '../locales/zh-TW.js';
import ja from '../locales/ja.js';
import ko from '../locales/ko.js';
import de from '../locales/de.js';
import es from '../locales/es.js';
import fr from '../locales/fr.js';
import pt from '../locales/pt.js';
import ru from '../locales/ru.js';
import vi from '../locales/vi.js';
import th from '../locales/th.js';
import id from '../locales/id.js';
import nl from '../locales/nl.js';
import pl from '../locales/pl.js';
import tr from '../locales/tr.js';
import uk from '../locales/uk.js';
import ar from '../locales/ar.js';
import it from '../locales/it.js';
import hi from '../locales/hi.js';
import ms from '../locales/ms.js';
import ta from '../locales/ta.js';
import tl from '../locales/tl.js';
import ur from '../locales/ur.js';
import fa from '../locales/fa.js';
import he from '../locales/he.js';
import bn from '../locales/bn.js';
import sw from '../locales/sw.js';
import { SUPPORTED_LANGUAGES, LANGUAGE_CODES, normalizeSystemLanguage } from './supported-languages.js';

function escapeHtml(str) {
    if (str == null) return '';
    const s = String(str);
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * 鲲穹AI播放器 - 多语言管理器
 * 封装 i18next 实现动态语言切换；未提供翻译的语言回退到英文。
 */
export class I18nManager {
    constructor() {
        this.currentLang = 'zh-CN';
        this.initialized = false;
        this.supportedLanguages = SUPPORTED_LANGUAGES;
    }

    /**
     * 初始化多语言
     */
    async init() {
        if (this.initialized) return;

        try {
            const savedLang = localStorage.getItem('app_language');
            const systemLang = navigator.language;
            const normalized = normalizeSystemLanguage(systemLang);

            if (savedLang && LANGUAGE_CODES.includes(savedLang)) {
                this.currentLang = savedLang;
            } else if (normalized) {
                this.currentLang = normalized;
            } else {
                this.currentLang = 'zh-CN';
            }

            // 有独立翻译的语言；其余使用 en-US 回退
            const resources = {
                'zh-CN': zhCN,
                'zh-TW': zhTW,
                'en-US': enUS,
                'ja': ja,
                'ko': ko,
                'de': de,
                'es': es,
                'fr': fr,
                'pt': pt,
                'pt-BR': pt,
                'ru': ru,
                'vi': vi,
                'th': th,
                'id': id,
                'nl': nl,
                'pl': pl,
                'tr': tr,
                'uk': uk,
                'ar': ar,
                'it': it,
                'hi': hi,
                'ms': ms,
                'ta': ta,
                'tl': tl,
                'ur': ur,
                'fa': fa,
                'he': he,
                'bn': bn,
                'sw': sw
            };
            LANGUAGE_CODES.forEach(code => {
                if (!resources[code]) resources[code] = enUS;
            });

            if (window.i18next) {
                await window.i18next.init({
                    lng: this.currentLang,
                    fallbackLng: 'en-US',
                    supportedLngs: LANGUAGE_CODES,
                    debug: false,
                    resources
                });

                this.initialized = true;
                this.renderLanguageMenu();
                this.updateUI();
                this.bindEvents();
                Logger.info(`多语言模块初始化完成，当前语言: ${this.currentLang}`);
            } else {
                Logger.error('i18next 未加载，请检查库文件引入');
            }
        } catch (error) {
            Logger.error('多语言初始化失败:', error);
        }
    }

    /**
     * 动态生成语言子菜单
     */
    renderLanguageMenu() {
        const container = document.getElementById('langListContainer');
        if (!container) return;

        container.innerHTML = this.supportedLanguages.map(({ code, label }) => {
            const isSelected = this.currentLang === code;
            return `
                <div class="menu-option" data-lang="${code}" id="lang-btn-${code.replace(/-/g, '_')}">
                    <i class="fas fa-check" style="visibility: ${isSelected ? 'visible' : 'hidden'};" id="langCheck-${String(code).replace(/-/g, '_')}"></i> ${escapeHtml(label)}
                </div>
            `;
        }).join('');
    }

    /**
     * 绑定 UI 事件（语言列表使用事件委托）
     */
    bindEvents() {
        const container = document.getElementById('langListContainer');
        if (container) {
            container.addEventListener('click', (e) => {
                const option = e.target.closest('.menu-option[data-lang]');
                if (option) {
                    e.preventDefault();
                    this.changeLanguage(option.dataset.lang);
                }
            });
        }
    }

    /**
     * 切换语言
     */
    async changeLanguage(lang) {
        console.log(`尝试切换语言到: ${lang}`);
        if (!this.initialized || !window.i18next) {
            console.error('i18n 未初始化或 i18next 丢失');
            return;
        }

        try {
            await window.i18next.changeLanguage(lang);
            this.currentLang = lang;
            localStorage.setItem('app_language', lang);
            this.updateUI();
            console.log(`语言成功切换为: ${lang}`);
            // 关闭帮助/语言下拉与子菜单，使界面立即体现切换结果
            document.querySelectorAll('.dropdown-menu').forEach(el => { el.style.display = 'none'; });
            document.querySelectorAll('.submenu').forEach(el => { el.style.display = 'none'; });
            // 通知其他组件（如播放模式按钮、登录区等）刷新文案
            document.dispatchEvent(new CustomEvent('languageChanged', { detail: { language: lang } }));
        } catch (error) {
            Logger.error('切换语言失败:', error);
        }
    }

    /**
     * 更新所有带有 data-i18n 属性的 DOM 元素
     */
    updateUI() {
        if (!window.i18next) return;

        const elements = document.querySelectorAll('[data-i18n]');
        elements.forEach(el => {
            try {
                const key = el.getAttribute('data-i18n');
                const optionsStr = el.getAttribute('data-i18n-options');
                const target = el.getAttribute('data-i18n-target');
                
                let options = {};
                if (optionsStr) {
                    options = JSON.parse(optionsStr);
                }

                let translation = window.i18next.t(key, options);

                if (target) {
                    // 如果指定了目标属性（如 placeholder, title）
                    el.setAttribute(target, translation);
                } else {
                    // 默认更新文本内容
                    // 注意：如果元素内部有图标（<i>），textContent 会覆盖图标
                    // 我们只更新文本节点，或者在 HTML 中结构化好
                    if (el.children.length === 0) {
                        el.textContent = translation;
                    } else {
                        // 寻找第一个文本节点并更新
                        for (let node of el.childNodes) {
                            if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '') {
                                node.textContent = translation;
                                break;
                            }
                        }
                    }
                }
            } catch (err) {
                console.error(`翻译元素失败 [${el.getAttribute('data-i18n')}]:`, err);
            }
        });

        // 特殊处理：更新 HTML lang 属性
        document.documentElement.lang = this.currentLang;

        // 更新语言子菜单勾选状态（动态生成的 id 为 langCheck-xxx，其中 - 被替换为 _）
        document.querySelectorAll('[id^="langCheck-"]').forEach(el => {
            const code = el.id.replace('langCheck-', '').replace(/_/g, '-');
            el.style.visibility = this.currentLang === code ? 'visible' : 'hidden';
        });
    }

    /**
     * 获取翻译文本
     * @param {string} key 
     * @param {object} options 
     * @returns {string}
     */
    t(key, options) {
        return window.i18next ? window.i18next.t(key, options) : key;
    }
}

// 导出单例
export const i18n = new I18nManager();