import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { getErrorMessage } from "../utils/errors.js";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(getErrorMessage(err, "Login failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <form onSubmit={handleSubmit} className="glass w-full max-w-sm rounded-3xl p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
            <Sparkles size={22} />
          </span>
          <h1 className="font-display text-2xl font-bold">Welcome back</h1>
          <p className="mt-1 text-sm opacity-70">Log in to keep your streak alive.</p>
        </div>

        {error && <p role="alert" className="mb-4 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-500">{error}</p>}

        <label htmlFor="email" className="mb-1 block text-sm font-medium opacity-80">Email</label>
        <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="field mb-4" />

        <label htmlFor="password" className="mb-1 block text-sm font-medium opacity-80">Password</label>
        <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className="field mb-6" />

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 py-2.5 font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Logging in…" : "Log in"}
        </button>

        <p className="mt-4 text-center text-sm opacity-70">
          No account?{" "}
          <Link to="/register" className="font-medium text-violet-500 hover:underline">Sign up</Link>
        </p>
        <p className="mt-3 text-center text-xs opacity-50">Demo: demo@habittracker.app / password123 (after running the seed script)</p>
      </form>
    </div>
  );
}
