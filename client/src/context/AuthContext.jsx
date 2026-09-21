import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { authService } from "../services/authService.js";
import { setAccessToken } from "../services/api.js";

const AuthContext = createContext(null);

// A NON-secret hint ("this browser has a session") so logged-out visitors don't fire a pointless
// refresh request on every page load. The real credential is the httpOnly cookie.
const SESSION_HINT = "momentum_session";

const safeStorage = {
  get: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private mode */
    }
  },
  remove: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* private mode */
    }
  },
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    safeStorage.remove(SESSION_HINT);
    setUser(null);
  }, []);

  const startSession = useCallback((data) => {
    if (!data?.token || typeof data.token !== "string" || !data?.user || typeof data.user !== "object") {
      // e.g. the dev proxy returned an HTML page because the API isn't running / wrong port
      throw new Error("Unexpected response from the server. Is the backend running on the port the proxy expects?");
    }
    setAccessToken(data.token);
    safeStorage.set(SESSION_HINT, "1");
    setUser(data.user);
    return data.user;
  }, []);

  // Restore the session on page load from the httpOnly refresh cookie
  useEffect(() => {
    // tokens used to be stored in localStorage; remove any left over from older versions
    safeStorage.remove("momentum_token");
    safeStorage.remove("momentum_user");

    if (!safeStorage.get(SESSION_HINT)) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    authService
      .refresh()
      .then((data) => {
        if (!cancelled) setUser(data.user);
      })
      .catch((err) => {
        // Only a real "no valid session" clears the hint. A network blip / restarting server must not.
        const status = err?.response?.status;
        if (!cancelled && (status === 401 || status === 403)) safeStorage.remove(SESSION_HINT);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // The axios interceptor fires this when a refresh definitively fails (expired/revoked session)
  useEffect(() => {
    window.addEventListener("momentum:logout", clearSession);
    return () => window.removeEventListener("momentum:logout", clearSession);
  }, [clearSession]);

  const login = useCallback(async (email, password) => startSession(await authService.login({ email, password })), [startSession]);
  const register = useCallback(async (name, email, password) => startSession(await authService.register({ name, email, password })), [startSession]);

  const logout = useCallback(async () => {
    try {
      await authService.logout(); // revokes the refresh token server-side and clears the cookie
    } catch {
      /* even if the server is unreachable, drop the local session */
    }
    clearSession();
  }, [clearSession]);

  const logoutEverywhere = useCallback(async () => {
    await authService.logoutAll();
    clearSession();
  }, [clearSession]);

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, register, logout, logoutEverywhere }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
};
