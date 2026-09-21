import { useState } from "react";
import { X } from "lucide-react";
import { habitService } from "../services/habitService.js";
import { CATEGORIES, ICON_OPTIONS, COLOR_OPTIONS, getHabitIcon } from "../utils/constants.js";
import { getErrorMessage } from "../utils/errors.js";

export default function HabitForm({ onClose, onCreated, prefill = null }) {
  const [name, setName] = useState(prefill?.name || "");
  const [description, setDescription] = useState(prefill?.description || "");
  const [category, setCategory] = useState(prefill?.category || "other");
  const [icon, setIcon] = useState("Star");
  const [color, setColor] = useState(COLOR_OPTIONS[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      await habitService.create({ name: name.trim(), description, category, icon, color });
      await onCreated();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Could not create habit"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit} className="glass w-full max-w-md rounded-3xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">New habit</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="opacity-60 hover:opacity-100">
            <X size={20} />
          </button>
        </div>

        {error && <p className="mb-3 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-500">{error}</p>}

        <label className="mb-1 block text-sm font-medium opacity-80">Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Morning Run" required className="field mb-3" />

        <label className="mb-1 block text-sm font-medium opacity-80">Description (optional)</label>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Why this habit matters to you" className="field mb-3" />

        <label className="mb-1 block text-sm font-medium opacity-80">Category</label>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="field mb-3">
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>

        <label className="mb-1 block text-sm font-medium opacity-80">Icon</label>
        <div className="mb-3 grid grid-cols-6 gap-2">
          {ICON_OPTIONS.map((iconName) => {
            const Icon = getHabitIcon(iconName);
            return (
              <button
                type="button"
                key={iconName}
                aria-label={iconName}
                aria-pressed={icon === iconName}
                onClick={() => setIcon(iconName)}
                className={`grid h-9 w-9 place-items-center rounded-lg border ${
                  icon === iconName ? "border-violet-400 bg-violet-400/20" : "border-[var(--field-border)]"
                }`}
              >
                <Icon size={16} />
              </button>
            );
          })}
        </div>

        <label className="mb-1 block text-sm font-medium opacity-80">Color</label>
        <div className="mb-5 flex gap-2">
          {COLOR_OPTIONS.map((c) => (
            <button
              type="button"
              key={c}
              aria-label={`Color ${c}`}
              aria-pressed={color === c}
              onClick={() => setColor(c)}
              className={`h-7 w-7 rounded-full border-2 ${color === c ? "border-[var(--text)]" : "border-transparent"}`}
              style={{ background: c }}
            />
          ))}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 py-2.5 font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create habit"}
        </button>
      </form>
    </div>
  );
}
