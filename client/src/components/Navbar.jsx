import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Moon, Sun, LogOut, Sparkles, LayoutDashboard, BarChart3, ShieldCheck } from "lucide-react";
import ChangePassword from "./ChangePassword.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";

const linkClass = ({ isActive }) =>
  `flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition hover:bg-white/20 hover:opacity-100 ${
    isActive ? "bg-white/20 opacity-100" : "opacity-80"
  }`;

export default function Navbar() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [showSecurity, setShowSecurity] = useState(false);

  if (!user) return null;

  return (
    <>
    <nav className="glass sticky top-4 z-40 mx-4 mt-4 flex items-center justify-between rounded-2xl px-5 py-3 md:mx-8">
      <NavLink to="/" className="flex items-center gap-2 font-display text-lg font-bold tracking-tight">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
          <Sparkles size={16} />
        </span>
        <span className="hidden sm:inline">Momentum</span>
      </NavLink>

      <div className="flex items-center gap-1 md:gap-2">
        <NavLink to="/" end className={linkClass}>
          <LayoutDashboard size={16} />
          <span className="hidden sm:inline">Dashboard</span>
        </NavLink>
        <NavLink to="/insights" className={linkClass}>
          <BarChart3 size={16} />
          <span className="hidden sm:inline">Insights</span>
        </NavLink>

        <button
          onClick={toggleTheme}
          aria-label="Toggle theme"
          className="grid h-9 w-9 place-items-center rounded-xl opacity-80 transition hover:bg-white/20 hover:opacity-100"
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        <button
          onClick={() => setShowSecurity(true)}
          aria-label="Account security"
          title="Account security"
          className="grid h-9 w-9 place-items-center rounded-xl opacity-80 transition hover:bg-white/20 hover:opacity-100"
        >
          <ShieldCheck size={16} />
        </button>

        <button
          onClick={async () => {
            await logout();
            navigate("/login");
          }}
          aria-label="Log out"
          className="grid h-9 w-9 place-items-center rounded-xl opacity-80 transition hover:bg-white/20 hover:opacity-100"
        >
          <LogOut size={16} />
        </button>
      </div>
    </nav>
    {/* outside <nav>: its backdrop-filter would otherwise trap a fixed-position modal */}
    {showSecurity && <ChangePassword onClose={() => setShowSecurity(false)} />}
    </>
  );
}
