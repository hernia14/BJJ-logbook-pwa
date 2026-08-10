import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // GitHub Pages 配信時のサブパス。ユーザーサイトのルート配信なら "/" に変える
  base: "./",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "BJJ Drill",
        short_name: "BJJ Drill",
        description: "ブラジリアン柔術の知識を間隔反復で定着させる一問一答アプリ",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        orientation: "portrait",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // カードデータを含む全アセットを事前キャッシュしオフライン動作させる
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,json}"],
        // カードデータはJSに埋め込まないため、事前キャッシュ対象の上限を上げる
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
      },
    }),
  ],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
} as Parameters<typeof defineConfig>[0]);
