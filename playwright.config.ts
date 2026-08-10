import { defineConfig, devices } from "@playwright/test";

/**
 * E2E。単体テストで担保できない「オフライン動作」と
 * 「エクスポート/インポートの整合性」を実ブラウザで確認する。
 *
 * オフライン動作は Service Worker の実挙動に依存し、
 * エクスポート/インポートは失敗すると学習履歴を失うため、
 * いずれも実ブラウザでの検証が要る。
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "mobile",
      use: { ...devices["Pixel 5"] },
    },
  ],
  // Service Worker を検証するため、dev ではなく本番ビルドを配信する
  webServer: {
    command: "npm run build && npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
