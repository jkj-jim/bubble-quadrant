import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import translationEN from './locales/en.json';
import translationZH from './locales/zh.json';
import translationJP from './locales/jp.json';

// Initialize i18n
export function initI18n(lang: 'en' | 'zh' | 'ja' | string) {
    // Initialize i18n
    // lang comes from bitable.bridge.getLanguage() which usually returns 'zh', 'en', 'ja' etc.
    // We map it to our resources keys.

    let targetLang = 'zh';
    if (lang) {
        const lowerLang = lang.toLowerCase();
        if (lowerLang.startsWith('zh')) targetLang = 'zh';
        else if (lowerLang.startsWith('en')) targetLang = 'en';
        else if (lowerLang.startsWith('ja') || lowerLang.startsWith('jp')) targetLang = 'jp';
    }

    i18n.use(initReactI18next).init({
        resources: {
            en: {
                translation: translationEN,
            },
            zh: {
                translation: translationZH,
            },
            jp: {
                translation: translationJP,
            },
        },
        lng: targetLang,
        fallbackLng: 'en',
        interpolation: {
            escapeValue: false,
        },
    });
}
