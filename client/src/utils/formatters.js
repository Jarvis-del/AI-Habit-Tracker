export function formatShortDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function pluralize(count, noun) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function heatColorForCount(count, dark) {
  if (count === 0) return dark ? "rgba(255,255,255,0.06)" : "rgba(76,29,149,0.06)";
  if (count === 1) return "#c4b5fd";
  if (count === 2) return "#a78bfa";
  return "#7c3aed";
}
