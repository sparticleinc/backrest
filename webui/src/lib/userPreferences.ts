import { useState, useEffect } from "react";
import {
  getLocale,
  setLocale,
  locales,
  // @ts-ignore
} from "../paraglide/runtime";

const STORAGE_KEY = "PARAGLIDE_LOCALE";

interface UserPreferences {
  language: string;
}

const defaultPreferences: UserPreferences = {
  language: getLocale(),
};

export const useUserPreferences = () => {
  const [preferences, setPreferences] = useState<UserPreferences>(() => ({
    language: getLocale(),
  }));

  const updatePreference = <K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K],
  ) => {
    setPreferences((prev) => {
      const next = { ...prev, [key]: value };
      return next;
    });

    if (key === "language") {
      // reload:true 让整页重新渲染，切换后立即全局生效。
      // paraglide 的 m.xxx() 消息在渲染时才读 locale、且非响应式，
      // 不刷新的话除本组件外的文案不会更新。
      setLocale(value as string, { reload: true });
    }
  };

  // Sync initial state if needed
  useEffect(() => {
    if (
      preferences.language &&
      locales.includes(preferences.language) &&
      preferences.language !== getLocale()
    ) {
      setLocale(preferences.language, { reload: false });
    }
  }, []);

  return {
    preferences,
    updatePreference,
    availableLanguages: locales,
  };
};
