import { createContext, useContext, useState, useEffect, useCallback } from "react";

const ThemeContext = createContext(null);

const safeGet = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const safeSet = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode etc. - theme just won't persist */
  }
};

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    const stored = safeGet("momentum_theme");
    if (stored === "dark" || stored === "light") return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  // The class lives on <html> so index.html can apply it before React loads (no flash)
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    safeSet("momentum_theme", theme);
  }, [theme]);

  // Follow system changes until the user picks a theme manually
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e) => {
      if (!safeGet("momentum_theme_manual")) setThemeState(e.matches ? "dark" : "light");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const toggleTheme = useCallback(() => {
    safeSet("momentum_theme_manual", "true");
    setThemeState((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
};
