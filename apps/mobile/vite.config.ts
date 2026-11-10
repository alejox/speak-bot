import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

/*
 * The manifest cannot read CSS variables, so these repeat tokens from src/styles/tokens.css (light theme):
 * the header surface (--color-surface, also the light theme-color in index.html) and the page (--color-bg).
 */
const THEME_COLOR = "#ffffff";
const BACKGROUND_COLOR = "#f0f2f5";

/**
 * Public path the app is served from: "/" on the desktop server, "/speak-bot/" on GitHub Pages.
 * Set with the SPEED_DECK_BASE environment variable at build time (SPEAK_BOT_BASE, its name before the
 * rename to Speed Deck, is still read). The Pages path keeps the repository name, speak-bot.
 */
export function resolveBase(value: string | undefined): string {
  const trimmed = (value ?? "").trim().replace(/^\/+|\/+$/g, "");
  return trimmed === "" ? "/" : `/${trimmed}/`;
}

const base = resolveBase(process.env.SPEED_DECK_BASE ?? process.env.SPEAK_BOT_BASE);

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["icon.svg", "icon-maskable.svg"],
      manifest: {
        name: "Speed Deck",
        short_name: "Speed Deck",
        description: "Voz: escribe o toca una frase y tu dispositivo habla por ti. Deck: controla OBS con la app de la computadora.",
        lang: "es",
        display: "standalone",
        start_url: base,
        scope: base,
        theme_color: THEME_COLOR,
        background_color: BACKGROUND_COLOR,
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
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
