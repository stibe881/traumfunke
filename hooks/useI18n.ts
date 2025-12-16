import { useState, useEffect, useCallback } from 'react';
import i18n, { initializeLanguage, setLanguage, getCurrentLanguage, LANGUAGES } from '../lib/i18n';
import { EventEmitter } from 'events';

// Global event emitter for language changes
const languageEventEmitter = new EventEmitter();

export function useI18n() {
    const [locale, setLocale] = useState(getCurrentLanguage());
    const [isReady, setIsReady] = useState(false);
    const [, forceUpdate] = useState(0);

    useEffect(() => {
        initializeLanguage().then((lang) => {
            setLocale(lang);
            setIsReady(true);
        });
    }, []);

    // Listen for language changes from other components
    useEffect(() => {
        const handleLanguageChange = (newLocale: string) => {
            setLocale(newLocale);
            forceUpdate(n => n + 1); // Force re-render
        };

        languageEventEmitter.on('languageChanged', handleLanguageChange);
        return () => {
            languageEventEmitter.off('languageChanged', handleLanguageChange);
        };
    }, []);

    const changeLanguage = useCallback(async (newLocale: 'de' | 'en' | 'fr' | 'it') => {
        await setLanguage(newLocale);
        setLocale(newLocale);
        // Notify all other components
        languageEventEmitter.emit('languageChanged', newLocale);
    }, []);

    const t = useCallback((key: string, options?: object) => {
        return i18n.t(key, options);
    }, [locale]); // Re-create when locale changes

    return {
        t,
        locale,
        changeLanguage,
        isReady,
        languages: LANGUAGES,
    };
}

export default useI18n;

