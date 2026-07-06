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
  zh: "中文",
  ja: "日本語",
};

// 语言切换器。放在侧栏底部而非设置弹窗内：切换语言会刷新整页，
// 避免用户在设置弹窗里编辑到一半时误触切换导致未保存数据丢失。
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
        {/* pe 预留出右侧下拉箭头的空间，避免文字与箭头重叠 */}
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
