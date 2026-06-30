// 调试模式开关：URL 中带 ?debug=1 时启用，用于显示默认隐藏的高级表单/设置。
// 使用 HashRouter，query 可能位于 location.search 或 hash 的 ? 之后，两处都检查。
export const isDebugEnabled = (): boolean =>
  new URLSearchParams(window.location.search).get("debug") === "1" ||
  new URLSearchParams(window.location.hash.split("?")[1] || "").get("debug") ===
    "1";

// React Hook 形式，便于在组件中使用：const debug = useDebug();
export const useDebug = (): boolean => isDebugEnabled();
