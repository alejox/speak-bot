import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const THEME_COLOR = "#1d4ed8";

/**
 * Public path the app is served from: "/" on the desktop server, "/speak-bot/" on GitHub Pages.
 * Set with the SPEAK_BOT_BASE environment variable at build time.
 */
export function resolveBase(value: string | undefined): string {
  const trimmed = (value ?? "").trim().replace(/^\/+|\/+$/g, "");
  return trimmed === "" ? "/" : `/${trimmed}/`;
}

const base = resolveBase(process.env.SPEAK_BOT_BASE);

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Speak Bot",
        short_name: "Speak Bot",
        description: "Escribe o toca una frase y deja que tu teléfono hable por ti.",
        lang: "es",
        display: "standalone",
        start_url: base,
        scope: base,
        theme_color: THEME_COLOR,
        background_color: "#ffffff",
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,webmanifest}"],
        // The desktop server hosts these next to the app; never answer them with the cached app shell.
        navigateFallbackDenylist: [/^\/overlay/, /^\/api\//, /^\/ws/],
      },
    }),
  ],
  server: {
    // Listen on the LAN so a phone on the same network can open the dev server.
    host: true,
  },
  preview: {
    host: true,
  },
});
