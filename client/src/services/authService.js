import api, { refreshSession } from "./api.js";

const XHR = { headers: { "X-Requested-With": "XMLHttpRequest" } };

export const authService = {
  register: (data) => api.post("/auth/register", data).then((r) => r.data),
  login: (data) => api.post("/auth/login", data).then((r) => r.data),
  refresh: refreshSession,
  me: () => api.get("/auth/me").then((r) => r.data),
  logout: () => api.post("/auth/logout", null, XHR).then((r) => r.data),
  logoutAll: () => api.post("/auth/logout-all").then((r) => r.data),
  changePassword: (data) => api.post("/auth/change-password", data).then((r) => r.data),
  updateSettings: (data) => api.patch("/auth/settings", data).then((r) => r.data),
};
