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
      // reload:true でページ全体を再描画し、切り替え後すぐに全体へ反映させる。
      // paraglide の m.xxx() メッセージは描画時に初めて locale を読み、リアクティブではないため、
      // 再読み込みしないとこのコンポーネント以外の文言が更新されない。
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
