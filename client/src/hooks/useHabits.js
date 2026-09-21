import { useState, useEffect, useCallback, useRef } from "react";
import { habitService } from "../services/habitService.js";
import { logService } from "../services/logService.js";
import { getErrorMessage } from "../utils/errors.js";

// Central hook for loading habits + toggling completions, shared across Dashboard/Insights.
export function useHabits() {
  const [habits, setHabits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const hasLoaded = useRef(false);

  const refresh = useCallback(async () => {
    // Only the FIRST load shows the loading state; later refreshes update in place
    // (previously every toggle blanked the whole list and re-triggered every AI request).
    if (!hasLoaded.current) setLoading(true);
    try {
      const { habits } = await habitService.list(false);
      setHabits(habits);
      setError(null);
      hasLoaded.current = true;
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load habits"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toggleToday = useCallback(
    async (habitId) => {
      const result = await logService.toggle(habitId);
      await refresh();
      return result;
    },
    [refresh]
  );

  return { habits, loading, error, refresh, toggleToday };
}
