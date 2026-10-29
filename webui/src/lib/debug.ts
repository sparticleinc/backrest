// デバッグモードのスイッチ: URL に ?debug=1 が付いているときに有効になり、デフォルトで非表示の詳細フォーム/設定を表示する。
// HashRouter を使っているため、query は location.search にも hash 内の ? の後にもありうるので、両方を確認する。
export const isDebugEnabled = (): boolean =>
  new URLSearchParams(window.location.search).get("debug") === "1" ||
  new URLSearchParams(window.location.hash.split("?")[1] || "").get("debug") ===
    "1";

// React Hook 形式で、コンポーネントから使いやすくする: const debug = useDebug();
export const useDebug = (): boolean => isDebugEnabled();
