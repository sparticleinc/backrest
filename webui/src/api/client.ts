import { useMemo } from "react";
import { createConnectTransport } from "@connectrpc/connect-web";
import { createClient } from "@connectrpc/connect";
import { Authentication } from "../../gen/ts/v1/authentication_pb";
import { Backrest } from "../../gen/ts/v1/service_pb";
import { BackrestSyncStateService } from "../../gen/ts/v1sync/syncservice_pb";
import { backendUrl } from "../state/buildcfg";

const tokenKey = "backrest-ui-authToken";
// Cookie shared with the GBase Onprem host page (backrest is embedded under
// /backup on the same origin). The browser sends it automatically with every
// request, so it is never attached manually; the backend reads it directly.
// It is only inspected here to detect whether we run embedded in GBase.
const gbaseTokenCookie = "LOCAL_MY_GPT_TOKEN";

export const setAuthToken = (token: string) => {
  localStorage.setItem(tokenKey, token);
};

export const getGBaseToken = (): string | null => {
  const entry = document.cookie
    .split("; ")
    .find((c) => c.startsWith(gbaseTokenCookie + "="));
  if (!entry) return null;
  const token = entry.slice(gbaseTokenCookie.length + 1);
  return token !== "" ? token : null;
};

const fetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> => {
  const headers = new Headers(init?.headers);
  let token = localStorage.getItem(tokenKey);
  if (token && token !== "") {
    headers.set("Authorization", "Bearer " + token);
  }
  // Include cookies even for cross-origin requests so the GBase token cookie
  // reaches the backend in local development (vite dev server -> backend).
  init = { ...init, headers, credentials: "include" };
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
