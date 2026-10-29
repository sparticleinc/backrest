import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

/**
 * GBase Onprem スタイルのテーマ。
 *
 * 設計の狙い: UI コンポーネントライブラリ（Chakra UI）を置き換えずに、配色を
 * GBase Onprem のビジュアル言語に統一する——紫（violet）のメインカラー + クールグレーのニュートラル + 淡い寒色系のパネル。
 *
 * 重要な約束事: Backrest は全画面で `blue` を「メインカラー/アクセントカラー」として使っている（主ボタン、リンク、
 * 情報メッセージ、スイッチなどはすべて blue.* と書かれている）。GBase のブランドカラーは紫 #7C68FB なので、
 * ここでは「あえて」blue パレットを GBase の紫にマッピングし直している——こうすることで既存の
 * blue.* の使用箇所が一度にブランドカラーになり、業務コードを 1 箇所ずつ直す必要がない（DRY、単一の情報源）。
 * あわせて `brand` エイリアスも用意しており、新しいコードでは colorPalette="brand" を直接使える。
 *
 * 色値の出典: gbase-frontend-onprem/packages/app/theme/colors.ts
 */

// GBase のブランドカラーの紫（violet）。Mantine の 50~900 に対応し、Chakra が必要とする 950 を補っている。
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

// 各パレットに対応するセマンティックトークン（solid/fg/muted/subtle/emphasized/contrast/focusRing）。
// colorPalette="brand" / "blue" で使う。
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

// GBase のクールグレーのニュートラルカラー（背景・枠線・テキストなど、すべてのニュートラルなセマンティックトークンに使う）。
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

// GBase 全体のメイン背景色 rgb(250, 251, 255)。
const appBg = "#FAFBFF";

const config = defineConfig({
  globalCss: {
    body: { bg: { base: appBg, _dark: "{colors.gray.950}" } },
  },
  theme: {
    tokens: {
      colors: {
        // brand と blue は同じ GBase の紫を指す（ファイル冒頭の説明を参照）。
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
        // GBase のモデル: キャンバスは淡い寒色の appBg とし、その上の「ブロック」（サイドバー / トップバー / カード）は
        // 枠線ではなく白 + 柔らかい影で浮かせて区別する。
        bg: {
          canvas: { value: { base: appBg, _dark: "{colors.gray.950}" } },
          panel: { value: { base: "#FFFFFF", _dark: "{colors.gray.900}" } },
        },
      },
      // GBase スタイルの影: 柔らかく、広く、寒色系。枠線の代わりにブロックの区切りとして使う。
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
