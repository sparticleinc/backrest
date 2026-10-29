import { createListCollection } from "@chakra-ui/react";
import { FiGlobe } from "react-icons/fi";
import { useUserPreferences } from "../../lib/userPreferences";
import * as m from "../../paraglide/messages";
import {
  SelectRoot,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValueText,
} from "../ui/select";

const languageNames: Record<string, string> = {
  en: "English",
  ja: "日本語",
};

// 言語切り替え。設定ダイアログ内ではなくサイドバーの下部に置く: 言語を切り替えるとページ全体が再読み込みされるため、
// 設定ダイアログで編集途中に誤って切り替え、未保存のデータを失うのを避ける。
export const LanguageSwitcher = () => {
  const { preferences, updatePreference, availableLanguages } =
    useUserPreferences();

  const languageOptions = createListCollection({
    items: availableLanguages.map((tag: string) => ({
      label: languageNames[tag] || tag,
      value: tag,
    })),
  });

  return (
    <SelectRoot
      collection={languageOptions}
      value={[preferences.language]}
      onValueChange={(e: any) => updatePreference("language", e.value[0])}
      size="sm"
    >
      {/* @ts-ignore */}
      <SelectTrigger>
        <FiGlobe style={{ marginInline: "0 6px", flexShrink: 0 }} />
        {/* pe で右側のドロップダウン矢印の領域を確保し、文字と矢印が重ならないようにする */}
        <SelectValueText
          pe={6}
          placeholder={m.settings_select_language_placeholder()}
        />
      </SelectTrigger>
      {/* @ts-ignore */}
      <SelectContent zIndex={2000}>
        {languageOptions.items.map((option: any) => (
          <SelectItem item={option} key={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </SelectRoot>
  );
};
