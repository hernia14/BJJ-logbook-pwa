import { expect, test } from "@playwright/test";

/**
 * 起動性能の監視（docs/requirements.md §I「起動時間」「5000カード規模での性能」）。
 *
 * 数値は環境で揺れるため、閾値は「明らかな劣化を検出する」ための緩めの上限にしてある。
 * 目的は絶対値の保証ではなく、退行の検出。
 */

/** JSバンドルの上限（KB）。カードデータを含めないこと */
const MAX_JS_KB = 400;
/** 起動から操作可能になるまでの上限（ms） */
const MAX_INTERACTIVE_MS = 3000;

test("起動性能とバンドルサイズが閾値内に収まる", async ({ page }) => {
  // 実際に操作できるようになるまでの時間を測る。
  // DOMContentLoaded はカードデータの取得完了を待たないため体感を表さない。
  const started = Date.now();
  await page.goto("/", { waitUntil: "load" });
  await expect(page.getByRole("heading", { name: "BJJ Drill" })).toBeVisible();
  const timeToInteractive = Date.now() - started;
  console.log(`操作可能まで ${timeToInteractive}ms`);
  expect(timeToInteractive).toBeLessThan(MAX_INTERACTIVE_MS);

  const metrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const sum = (pred: (r: PerformanceResourceTiming) => boolean) =>
      resources.filter(pred).reduce((acc, r) => acc + (r.decodedBodySize || r.transferSize || 0), 0);
    return {
      domContentLoaded: nav.domContentLoadedEventEnd - nav.startTime,
      loadEvent: nav.loadEventEnd - nav.startTime,
      jsBytes: sum((r) => r.name.endsWith(".js")),
      jsonBytes: sum((r) => r.name.endsWith(".json")),
    };
  });

  const jsKb = metrics.jsBytes / 1024;
  const jsonKb = metrics.jsonBytes / 1024;
  console.log(
    `起動: DOMContentLoaded ${metrics.domContentLoaded.toFixed(0)}ms / load ${metrics.loadEvent.toFixed(0)}ms`,
  );
  console.log(`JS ${jsKb.toFixed(0)}KB / JSON ${jsonKb.toFixed(0)}KB`);

  expect(jsKb).toBeLessThan(MAX_JS_KB);
  expect(metrics.domContentLoaded).toBeLessThan(MAX_INTERACTIVE_MS);
});

test("カードデータはJSバンドルと分離して配信される", async ({ page }) => {
  // カードデータをJSに埋め込むと、枚数に比例してJSの解析時間が伸びる。
  // 5000枚規模ではバンドルが数MBになり起動性能の要件を満たせなくなるため、
  // 別アセットとして配信し、必要になった時点で読み込む構成を維持する。
  const jsonRequests: string[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith(".json")) jsonRequests.push(r.url());
  });

  await page.goto("/", { waitUntil: "load" });
  await expect(page.getByRole("heading", { name: "BJJ Drill" })).toBeVisible();

  expect(jsonRequests.some((u) => u.includes("cards"))).toBe(true);
});
