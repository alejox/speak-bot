import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const THEME_COLOR = "#1d4ed8";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Speak Bot",
        short_name: "Speak Bot",
        description: "Type or tap a phrase and let your phone speak for you.",
        display: "standalone",
        start_url: ".",
        scope: ".",
        theme_color: THEME_COLOR,
        background_color: "#ffffff",
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,webmanifest}"],
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
