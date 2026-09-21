import axios from "axios";

// VITE_API_URL is only needed when frontend and backend are deployed separately.
const baseURL = `${(import.meta.env.VITE_API_URL || "").replace(/\/$/, "")}/api/v1`;

/*
 * Session model (security):
 *  - The short-lived ACCESS token (15 min) is kept only in memory. It is never written to
 *    localStorage, so an XSS bug cannot steal a long-lived credential from storage.
 *  - The long-lived REFRESH token lives in an httpOnly cookie the browser sends only to /auth/*;
 *    JavaScript cannot read it. It rotates on every use (see the server's /auth/refresh).
 *  - When an access token expires, the first 401 triggers ONE refresh (shared by all concurrent
 *    requests) and the failed request is replayed transparently.
 */
let accessToken = null;
export const setAccessToken = (token) => {
  accessToken = token || null;
};
export const getAccessToken = () => accessToken;

const api = axios.create({ baseURL, timeout: 20_000, withCredentials: true });

// Separate client for the refresh call so it can never trigger the retry interceptor below
export const refreshClient = axios.create({
  baseURL,
  timeout: 20_000,
  withCredentials: true,
  headers: { "X-Requested-With": "XMLHttpRequest" }, // CSRF defence: cross-site pages cannot send this header
});

// Tell the server the user's time zone so "today" means the same day on both sides
const timeZone = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
})();

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  if (timeZone) config.headers["X-Timezone"] = timeZone;
  return config;
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let refreshPromise = null;

/** Exchanges the httpOnly refresh cookie for a new access token. Concurrent callers share one request. */
export function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          const { data } = await refreshClient.post("/auth/refresh");
          if (!data?.token) throw new Error("Invalid refresh response");
          setAccessToken(data.token);
          return data;
        } catch (err) {
          // Another tab rotated the cookie a moment ago: wait, then retry once with the new cookie
          if (attempt === 0 && err.response?.data?.code === "REFRESH_RACE") {
            await sleep(400);
            continue;
          }
          throw err;
        }
      }
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

// These endpoints answer 401 for "wrong password / no session" - that is not an expired access token.
const isAuthEndpoint = (url = "") => /\/auth\/(login|register|refresh|logout)\b/.test(url);

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const { config, response } = err;
    if (response?.status === 401 && config && !config._retried && !isAuthEndpoint(config.url)) {
      config._retried = true;
      try {
        const data = await refreshSession();
        config.headers.Authorization = `Bearer ${data.token}`;
        return api(config); // replay the original request with the fresh token
      } catch (refreshErr) {
        // Only a definite "no valid session" logs the user out; a network blip must not.
        const status = refreshErr.response?.status;
        if (status === 401 || status === 403) {
          setAccessToken(null);
          window.dispatchEvent(new Event("momentum:logout"));
        }
      }
    }
    return Promise.reject(err);
  }
);

export default api;
