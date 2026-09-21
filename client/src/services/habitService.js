import api from "./api.js";

export const habitService = {
  list: (includeArchived = false) =>
    api.get(`/habits?includeArchived=${includeArchived}`).then((r) => r.data),
  get: (id) => api.get(`/habits/${id}`).then((r) => r.data),
  create: (data) => api.post("/habits", data).then((r) => r.data),
  update: (id, data) => api.patch(`/habits/${id}`, data).then((r) => r.data),
  archive: (id) => api.patch(`/habits/${id}/archive`).then((r) => r.data),
  remove: (id) => api.delete(`/habits/${id}`).then((r) => r.data),
};
