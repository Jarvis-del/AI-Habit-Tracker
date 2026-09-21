import { useState } from "react";
import { X, KeyRound, LogOut } from "lucide-react";
import { authService } from "../services/authService.js";
import { setAccessToken } from "../services/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { getErrorMessage } from "../utils/errors.js";

export const validateNewPassword = (pw) => {
  if (pw.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Password must contain a letter and a number";
  return "";
};

export default function ChangePassword({ onClose }) {
  const { logoutEverywhere } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const problem = validateNewPassword(next) || (next !== confirm ? "New passwords don't match" : "");
    if (problem) return setError(problem);
    setBusy(true);
    try {
      const data = await authService.changePassword({ currentPassword: current, newPassword: next });
      setAccessToken(data.token); // this device keeps a fresh session; every other device is signed out
      setDone(data.message || "Password updated.");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't change the password."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} className="glass w-full max-w-sm rounded-3xl p-6" aria-label="Change password">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
            <KeyRound size={18} className="text-violet-500" /> Account security
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="opacity-60 hover:opacity-100">
            <X size={20} />
          </button>
        </div>

        {error && <p role="alert" className="mb-3 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-500">{error}</p>}
        {done && <p role="status" className="mb-3 rounded-lg bg-emerald-500/15 px-3 py-2 text-sm text-emerald-600">{done}</p>}

        <label htmlFor="cp-current" className="mb-1 block text-sm font-medium opacity-80">Current password</label>
        <input id="cp-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required className="field mb-3" />

        <label htmlFor="cp-new" className="mb-1 block text-sm font-medium opacity-80">New password <span className="opacity-60">(8+ chars, letter + number)</span></label>
        <input id="cp-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required className="field mb-3" />

        <label htmlFor="cp-confirm" className="mb-1 block text-sm font-medium opacity-80">Confirm new password</label>
        <input id="cp-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required className="field mb-4" />

        <button type="submit" disabled={busy} className="w-full rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 py-2.5 font-medium text-white disabled:opacity-50">
          {busy ? "Updating…" : "Change password"}
        </button>

        <button type="button" onClick={logoutEverywhere} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--field-border)] py-2 text-sm hover:bg-white/10">
          <LogOut size={14} /> Sign out on all devices
        </button>
      </form>
    </div>
  );
}
