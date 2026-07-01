import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

/**
 * GBase Onprem 风格主题。
 *
 * 设计目标：在不更换 UI 组件库（Chakra UI）的前提下，把配色统一成
 * GBase Onprem 的视觉语言——紫色（violet）主色 + 冷灰中性色 + 浅冷色面板。
 *
 * 关键约定：Backrest 全站统一用 `blue` 作为"主色/强调色"（主按钮、链接、
 * 信息提示、开关等都写的是 blue.*）。GBase 的品牌主色是紫色 #7C68FB，
 * 因此这里"故意"把 blue 调色板重映射为 GBase 紫色——这样所有既有的
 * blue.* 用法会一次性变成品牌色，无需逐处修改业务代码（DRY，单一数据源）。
 * 同时提供 `brand` 别名，新代码可直接使用 colorPalette="brand"。
 *
 * 色值来源：gbase-frontend-onprem/packages/app/theme/colors.ts
 */

// GBase 品牌紫色（violet），对应 Mantine 的 50~900，并补全 Chakra 需要的 950。
const brandPalette = {
  50: { value: "#FBF9FF" },
  100: { value: "#F1EEFF" },
  200: { value: "#DED9FF" },
  300: { value: "#C8BFFF" },
  400: { value: "#A395FC" },
  500: { value: "#7C68FB" },
  600: { value: "#705EE2" },
  700: { value: "#6454CB" },
  800: { value: "#5A4CB7" },
  900: { value: "#5144A5" },
  950: { value: "#3D3380" },
};

// 每个色板对应的语义令牌（solid/fg/muted/subtle/emphasized/contrast/focusRing），
// 供 colorPalette="brand" / "blue" 使用。
const brandSemantic = {
  solid: { value: "{colors.brand.500}" },
  contrast: { value: "white" },
  fg: { value: { base: "{colors.brand.700}", _dark: "{colors.brand.300}" } },
  muted: { value: { base: "{colors.brand.100}", _dark: "{colors.brand.900}" } },
  subtle: { value: { base: "{colors.brand.50}", _dark: "{colors.brand.950}" } },
  emphasized: {
    value: { base: "{colors.brand.200}", _dark: "{colors.brand.800}" },
  },
  focusRing: { value: "{colors.brand.500}" },
};

// GBase 冷灰中性色（用于背景、边框、文本等所有中性语义令牌）。
const grayPalette = {
  50: { value: "#F9FAFB" },
  100: { value: "#F2F4F7" },
  200: { value: "#E4E7EC" },
  300: { value: "#D0D5DD" },
  400: { value: "#98A2B3" },
  500: { value: "#667085" },
  600: { value: "#475467" },
  700: { value: "#344054" },
  800: { value: "#1D2939" },
  900: { value: "#101828" },
  950: { value: "#0C111D" },
};

const fontStack =
  '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans",sans-serif,"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol","Noto Color Emoji"';

// GBase 全局主背景色 rgb(250, 251, 255)。
const appBg = "#FAFBFF";

const config = defineConfig({
  globalCss: {
    body: { bg: { base: appBg, _dark: "{colors.gray.950}" } },
  },
  theme: {
    tokens: {
      colors: {
        // brand 与 blue 指向同一套 GBase 紫色（见文件顶部说明）。
        brand: brandPalette,
        blue: brandPalette,
        gray: grayPalette,
      },
      fonts: {
        body: { value: fontStack },
        heading: { value: fontStack },
      },
    },
    semanticTokens: {
      colors: {
        brand: brandSemantic,
        blue: brandSemantic,
        // GBase 模型：画布用浅冷色调 appBg，其上的"区块"（侧边栏 / 顶栏 / 卡片）
        // 用白色 + 柔和阴影浮起来区分，而非边框线。
        bg: {
          canvas: { value: { base: appBg, _dark: "{colors.gray.950}" } },
          panel: { value: { base: "#FFFFFF", _dark: "{colors.gray.900}" } },
        },
      },
      // GBase 风格阴影：柔和、大面积、冷色调，用来替代边框分隔区块。
      shadows: {
        panel: {
          value: {
            base: "0px 10px 60px 0px rgba(226, 236, 249, 0.50)",
            _dark: "0px 10px 40px 0px rgba(0, 0, 0, 0.50)",
          },
        },
        card: {
          value: {
            base: "0px 8px 30px 0px rgba(112, 144, 176, 0.12)",
            _dark: "0px 8px 24px 0px rgba(0, 0, 0, 0.40)",
          },
        },
      },
    },
  },
});

export const system = createSystem(defaultConfig, config);
