import api from "./api.js";

export const logService = {
  // No date is sent: the server derives "today" from the X-Timezone header
  toggle: (habitId, date) => api.post("/logs/toggle", { habitId, ...(date ? { date } : {}) }).then((r) => r.data),
  list: (params = {}) => api.get("/logs", { params }).then((r) => r.data),
  weeklySummary: () => api.get("/logs/weekly-summary").then((r) => r.data),
};
