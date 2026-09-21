import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// NOTE: Tailwind v4 is wired in ONLY through this Vite plugin. The old postcss.config.js
// listed "@tailwindcss/vite" as a PostCSS plugin, which crashed CSS processing
// ("Cannot convert object to primitive value") and left the whole app as a blank page.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // 127.0.0.1 (not "localhost") avoids IPv6 (::1) resolution problems on Node 17+
  const apiTarget = env.VITE_API_PROXY_TARGET || "http://127.0.0.1:5000";

  return {
    plugins: [react(), tailwindcss()],
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: "./src/test/setup.js",
      include: ["src/**/*.test.{js,jsx}"],
      css: false,
      coverage: { provider: "v8", include: ["src/**/*.{js,jsx}"], exclude: ["src/main.jsx", "src/test/**", "src/**/*.test.*"], reporter: ["text-summary"] },
    },
    server: {
      port: 5173,
      proxy: {
        "/api": { target: apiTarget, changeOrigin: true },
      },
    },
  };
});
