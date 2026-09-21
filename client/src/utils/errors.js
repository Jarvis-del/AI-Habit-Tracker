/** Turn any axios/network error into a message a human can act on. */
export function getErrorMessage(err, fallback = "Something went wrong. Please try again.") {
  if (err?.response?.data?.message) return err.response.data.message;
  if (err?.code === "ECONNABORTED") return "The request timed out. Please try again.";
  if (err?.response) {
    // The proxy answers with an empty 500/502/504 when the API isn't running
    if ([500, 502, 503, 504].includes(err.response.status) && !err.response.data?.message) {
      return "Can't reach the API server. Is the backend running? (cd server && npm run dev)";
    }
    return `${fallback} (HTTP ${err.response.status})`;
  }
  if (err?.request) return "Can't reach the API server. Is the backend running? (cd server && npm run dev)";
  return err?.message || fallback;
}
