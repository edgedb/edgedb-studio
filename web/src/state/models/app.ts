import {createContext, Model, model, prop} from "mobx-keystone";

import {InstanceState} from "@dbsof/studio/state/instance";
import {mockMode} from "@dbsof/platform/client";

export const serverUrl = "http://localhost:5757";

const url = new URL(window.location.toString());

const TOKEN_KEY = "dbsofAuthToken";
const USERNAME_KEY = "dbsofAuthUsername";

let authToken: string | null = mockMode ? "mock-token" : null;
let authUsername: string | null = null;

if (url.searchParams.has("authToken")) {
  authToken = url.searchParams.get("authToken")!;
  localStorage.setItem(TOKEN_KEY, authToken);
  localStorage.removeItem(USERNAME_KEY);

  url.searchParams.delete("authToken");
  window.history.replaceState(window.history.state, "", url);
} else {
  authToken = localStorage.getItem(TOKEN_KEY);
  authUsername = localStorage.getItem(USERNAME_KEY);

  if (mockMode && !authToken) {
    authToken = "mock-token";
    authUsername = "demo";
    localStorage.setItem(TOKEN_KEY, authToken);
    localStorage.setItem(USERNAME_KEY, authUsername);
  }
}

if (!authToken && !mockMode) {
  url.pathname = "/ui/_login";
  window.history.replaceState(null, "", url);
}

export function setAuthToken(username: string, token: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USERNAME_KEY, username);
  window.location.replace("/ui");
}

export function clearAuthToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
  if (window.location.pathname !== "/ui/_login") {
    window.location.assign("/ui/_login");
  }
}

export const appCtx = createContext<App>();

@model("App")
export class App extends Model({
  instanceState: prop(
    () =>
      new InstanceState({
        serverUrl,
      })
  ),
}) {
  onInit() {
    this.instanceState._authProvider = {
      getAuthToken: () => authToken!,
      getAuthUser: () => authUsername!,
      invalidateToken: () => clearAuthToken(),
    };

    if (authToken) {
      this.instanceState.fetchInstanceInfo();
    }
    appCtx.set(this, this);
  }
}
