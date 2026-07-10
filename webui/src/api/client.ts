import { useMemo } from "react";
import { createConnectTransport } from "@connectrpc/connect-web";
import { createClient } from "@connectrpc/connect";
import { Authentication } from "../../gen/ts/v1/authentication_pb";
import { Backrest } from "../../gen/ts/v1/service_pb";
import { BackrestSyncStateService } from "../../gen/ts/v1sync/syncservice_pb";
import { backendUrl } from "../state/buildcfg";

const tokenKey = "backrest-ui-authToken";
// Cookie shared with the GBase Onprem host page (backrest is embedded under
// /backup on the same origin, so cookies are shared). When present it takes
// priority over backrest's own login token.
const gbaseTokenCookie = "LOCAL_MY_GPT_TOKEN";

export const setAuthToken = (token: string) => {
  localStorage.setItem(tokenKey, token);
};

export const getGBaseToken = (): string | null => {
  const entry = document.cookie
    .split("; ")
    .find((c) => c.startsWith(gbaseTokenCookie + "="));
  if (!entry) return null;
  let raw = entry.slice(gbaseTokenCookie.length + 1);
  try {
    raw = decodeURIComponent(raw);
  } catch {
    // Not URL-encoded; use the raw value.
  }
  // The host page may store the token with a "Bearer " prefix (and possibly
  // JSON-quoted); normalize to the bare token.
  const token = raw
    .replace(/^"+|"+$/g, "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  return token !== "" ? token : null;
};

const fetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> => {
  const headers = new Headers(init?.headers);
  let token = getGBaseToken() || localStorage.getItem(tokenKey);
  if (token && token !== "") {
    headers.set("Authorization", "Bearer " + token);
  }
  init = { ...init, headers };
  return window.fetch(input, init);
};

const transport = createConnectTransport({
  baseUrl: backendUrl,
  useBinaryFormat: true,
  fetch: fetch as typeof globalThis.fetch,
});

export const authenticationService = createClient(Authentication, transport);

export const backrestService = createClient(Backrest, transport);

export const syncStateService = createClient(
  BackrestSyncStateService,
  transport,
);
