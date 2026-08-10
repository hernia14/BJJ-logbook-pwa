import { expect, test } from "@playwright/test";

/**
 * オフライン動作の検証。
 *
 * 「サーバを持たずオフラインで使う」は本アプリの前提条件であり
 * （docs/requirements.md §I）、Service Worker の実挙動に依存するため
 * 実ブラウザで確認する必要がある。
 */
test("ネットワークを遮断しても起動して学習できる", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "BJJ Drill" })).toBeVisible();

  // Service Worker が事前キャッシュを終えるまで待つ
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return reg.active?.state;
  });
  // 事前キャッシュの完了を待つため一度リロードする
  await page.reload();
  await expect(page.getByRole("heading", { name: "BJJ Drill" })).toBeVisible();

  // レビューモードを有効にして出題できる状態にする
  await page.getByRole("button", { name: "設定" }).click();
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "閉じる" }).click();

  // ここからネットワークを遮断する
  await context.setOffline(true);
  // 遮断が効いていることを確認する。効いていなければこのテスト自体が無意味になる
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);
  await page.reload();

  // オフラインでも起動し、カードデータが読める
  await expect(page.getByRole("heading", { name: "BJJ Drill" })).toBeVisible();
  await expect(page.getByText("レビューモード")).toBeVisible();

  // オフラインのまま実際に出題まで進める
  await page.getByRole("button", { name: /学習を始める/ }).click();
  await expect(page.getByRole("button", { name: "答えを見る" })).toBeVisible();

  await page.getByRole("button", { name: "答えを見る" }).click();
  await expect(page.getByText("思い出せた度合いを選ぶ")).toBeVisible();

  await page.getByRole("button", { name: /即答/ }).click();

  // オフラインでも学習結果が保存される
  const saved = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const req = indexedDB.open("bjj-drill");
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("srs", "readonly");
          const all = tx.objectStore("srs").getAll();
          tx.oncomplete = () => {
            db.close();
            resolve(all.result.length);
          };
        };
      }),
  );
  expect(saved).toBeGreaterThan(0);

  await context.setOffline(false);
});
