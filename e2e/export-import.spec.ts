import { expect, test } from "@playwright/test";

/**
 * エクスポート/インポートの整合性。
 *
 * サーバ同期を持たない設計のため、ここが壊れると
 * 端末を変えた時点で学習履歴を失う（docs/requirements.md §I）。
 */

/** レビューモードを有効にして数枚解答し、履歴を作る */
async function studySomeCards(page: import("@playwright/test").Page, count: number) {
  await page.getByRole("button", { name: "設定" }).click();
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "閉じる" }).click();

  await page.getByRole("button", { name: /学習を始める/ }).click();
  for (let i = 0; i < count; i++) {
    await page.getByRole("button", { name: "答えを見る" }).click();
    await page.getByRole("button", { name: /即答/ }).click();
  }
  await page.getByRole("button", { name: "終了" }).click();
}

async function srsCount(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(
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
}

test("エクスポートしたファイルをインポートすると学習履歴が復元される", async ({ page }) => {
  await page.goto("/");
  await studySomeCards(page, 3);

  const before = await srsCount(page);
  expect(before).toBe(3);

  // エクスポート
  await page.getByRole("button", { name: "設定" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "エクスポート" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();

  // 履歴を消してから復元する
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "履歴を削除" }).click();
  await expect(page.getByText("学習履歴を削除しました。")).toBeVisible();
  expect(await srsCount(page)).toBe(0);

  await page.getByRole("button", { name: "インポート" }).click();
  await page.setInputFiles('input[type="file"]', path as string);
  await expect(page.getByText(/インポートしました/)).toBeVisible();

  expect(await srsCount(page)).toBe(before);
});

test("他形式のJSONをインポートしても履歴を壊さない", async ({ page }) => {
  await page.goto("/");
  await studySomeCards(page, 2);
  const before = await srsCount(page);
  expect(before).toBe(2);

  await page.getByRole("button", { name: "設定" }).click();
  await page.getByRole("button", { name: "インポート" }).click();
  await page.setInputFiles('input[type="file"]', {
    name: "not-ours.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ hello: "world" })),
  });

  await expect(page.getByText("このアプリのエクスポートファイルではありません")).toBeVisible();
  // 既存の履歴は保持されたまま
  expect(await srsCount(page)).toBe(before);
});

test("壊れたJSONをインポートしても履歴を壊さない", async ({ page }) => {
  await page.goto("/");
  await studySomeCards(page, 2);
  const before = await srsCount(page);

  await page.getByRole("button", { name: "設定" }).click();
  await page.getByRole("button", { name: "インポート" }).click();
  await page.setInputFiles('input[type="file"]', {
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from("{ これはJSONではない"),
  });

  await expect(page.getByText("JSONとして読み取れませんでした。")).toBeVisible();
  expect(await srsCount(page)).toBe(before);
});
