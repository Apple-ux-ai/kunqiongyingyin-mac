/**
 * 支持的语言列表：code 为 i18next 使用的语言码，label 为菜单中显示的本语种名称。
 * 简体中文、繁体中文、英语排在前三位，其余按语种排列；未提供翻译的语言使用英文 (en-US) 回退。
 */
export const SUPPORTED_LANGUAGES = [
    { code: 'zh-CN', label: '简体中文' },
    { code: 'zh-TW', label: '繁體中文' },
    { code: 'en-US', label: 'English' },
    { code: 'ar', label: 'العربية' },
    { code: 'bn', label: 'বাংলা' },
    { code: 'de', label: 'Deutsch' },
    { code: 'es', label: 'Español' },
    { code: 'fa', label: 'فارسی' },
    { code: 'fr', label: 'Français' },
    { code: 'he', label: 'עברית' },
    { code: 'hi', label: 'हिन्दी' },
    { code: 'id', label: 'Bahasa Indonesia' },
    { code: 'it', label: 'Italiano' },
    { code: 'ja', label: '日本語' },
    { code: 'ko', label: '한국어' },
    { code: 'ms', label: 'Bahasa Melayu' },
    { code: 'nl', label: 'Nederlands' },
    { code: 'pl', label: 'Polski' },
    { code: 'pt', label: 'Português' },
    { code: 'pt-BR', label: 'Português (Brasil)' },
    { code: 'ru', label: 'Русский' },
    { code: 'sw', label: 'Kiswahili' },
    { code: 'ta', label: 'தமிழ்' },
    { code: 'th', label: 'ไทย' },
    { code: 'tl', label: 'Tagalog' },
    { code: 'tr', label: 'Türkçe' },
    { code: 'uk', label: 'Українська' },
    { code: 'ur', label: 'اردو' },
    { code: 'vi', label: 'Tiếng Việt' }
];

export const LANGUAGE_CODES = SUPPORTED_LANGUAGES.map(({ code }) => code);

/** 将浏览器/系统语言映射到我们支持的语言码 */
export function normalizeSystemLanguage(systemLang) {
    if (!systemLang || typeof systemLang !== 'string') return null;
    const lower = systemLang.toLowerCase();
    const part = lower.split(/[-_]/)[0];
    const region = lower.split(/[-_]/)[1] || '';
    // 精确匹配
    if (LANGUAGE_CODES.includes(lower)) return lower;
    if (LANGUAGE_CODES.includes(systemLang)) return systemLang;
    // 中文
    if (part === 'zh') {
        if (region === 'tw' || region === 'hk' || region === 'hant') return 'zh-TW';
        return 'zh-CN';
    }
    // 葡萄牙语
    if (part === 'pt' && region === 'br') return 'pt-BR';
    if (part === 'pt') return 'pt';
    // 英语
    if (part === 'en') return 'en-US';
    // 其它：只匹配语种
    const byFirst = SUPPORTED_LANGUAGES.find(({ code }) => code.split('-')[0] === part);
    return byFirst ? byFirst.code : null;
}
