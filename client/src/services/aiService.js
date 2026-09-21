import api from "./api.js";

// Server-side worst case is ~60s (40s retry budget + one final 20s attempt), so allow 75s
const AI = { timeout: 75_000 };

export const aiService = {
  morningBanner: () => api.get("/ai/morning-banner", AI).then((r) => r.data),
  suggestHabits: (data) => api.post("/ai/suggest-habits", data, AI).then((r) => r.data),
  // One request checks every habit server-side (was: one request per habit)
  streakRecovery: () => api.get("/ai/streak-recovery", AI).then((r) => r.data),
  weeklyReport: (refresh = false) =>
    api.get("/ai/weekly-report", { ...AI, params: refresh ? { refresh: true } : undefined }).then((r) => r.data),
  chat: (message, history = []) => api.post("/ai/chat", { message, history }, AI).then((r) => r.data),
};
