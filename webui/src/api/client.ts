import { createConnectTransport } from "@connectrpc/connect-web";
import { createClient } from "@connectrpc/connect";
import { Backrest } from "../../gen/ts/v1/service_pb";
import { BackrestSyncStateService } from "../../gen/ts/v1sync/syncservice_pb";
import { backendUrl } from "../state/buildcfg";

// Authentication is delegated entirely to GBase Onprem: the browser sends the
// LOCAL_MY_GPT_TOKEN cookie automatically and the backend validates it.
// Include cookies even for cross-origin requests so the GBase token cookie
// reaches the backend in local development (vite dev server -> backend).
const fetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> => {
  return window.fetch(input, { ...init, credentials: "include" });
};

const transport = createConnectTransport({
  baseUrl: backendUrl,
  useBinaryFormat: true,
  fetch: fetch as typeof globalThis.fetch,
});

export const backrestService = createClient(Backrest, transport);

export const syncStateService = createClient(
  BackrestSyncStateService,
  transport,
);
