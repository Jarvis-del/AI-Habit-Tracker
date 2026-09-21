import { useCallback, useEffect, useState } from "react";
import { Sparkles, AlertTriangle, RefreshCw } from "lucide-react";
import { aiService } from "../services/aiService.js";
import { getErrorMessage } from "../utils/errors.js";

export default function MorningBanner() {
  const [state, setState] = useState({ status: "loading", banner: "", error: "" });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, status: "loading" }));
    try {
      const { banner, disabled } = await aiService.morningBanner();
      if (disabled || !banner) setState({ status: "hidden", banner: "", error: "" });
      else setState({ status: "ready", banner, error: "" });
    } catch (err) {
      // Show WHY it failed (missing key, quota...) instead of silently hiding the banner
      setState({ status: "error", banner: "", error: getErrorMessage(err, "Couldn't load today's motivation.") });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (state.status === "loading") {
    return (
      <div className="glass mb-6 flex items-center gap-3 rounded-2xl p-4 opacity-70">
        <Sparkles size={18} className="animate-pulse" />
        <span className="text-sm">Thinking of something motivating…</span>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div role="alert" className="glass mb-6 flex items-start gap-3 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-500" />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-medium">AI motivation isn't available right now</p>
          <p className="mt-0.5 opacity-80">{state.error}</p>
        </div>
        <button onClick={load} aria-label="Retry" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg hover:bg-white/20">
          <RefreshCw size={15} />
        </button>
      </div>
    );
  }

  if (state.status === "hidden") return null;

  return (
    <div className="glass fade-in mb-6 flex items-start gap-3 rounded-2xl bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 p-4">
      <Sparkles size={18} className="mt-0.5 shrink-0 text-violet-500" />
      <p className="text-sm font-medium">{state.banner}</p>
    </div>
  );
}
