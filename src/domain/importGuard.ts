/**
 * エクスポートファイルの形式検証（純関数）。
 *
 * IndexedDB に触れずに検証だけを行えるよう、db 層から切り出してある。
 * 誤ったファイルを読み込んで学習履歴を破壊しないための防御。
 */

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

export function validateExportPayload(raw: unknown): ValidationResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "ファイルの内容がJSONオブジェクトではありません" };
  }
  const p = raw as Record<string, unknown>;

  if (p.format !== "bjj-drill-export") {
    return { ok: false, error: "このアプリのエクスポートファイルではありません" };
  }
  if (p.version !== 1) {
    return { ok: false, error: `未対応のバージョンです: ${String(p.version)}` };
  }
  if (!Array.isArray(p.srs)) {
    return { ok: false, error: "srs が配列ではありません" };
  }
  if (!Array.isArray(p.reviewLog)) {
    return { ok: false, error: "reviewLog が配列ではありません" };
  }
  for (const row of p.srs as unknown[]) {
    if (typeof row !== "object" || row === null) {
      return { ok: false, error: "srs に不正な要素が含まれています" };
    }
    const r = row as Record<string, unknown>;
    if (typeof r.cardId !== "string" || typeof r.dueAt !== "number") {
      return { ok: false, error: "srs の要素に cardId または dueAt がありません" };
    }
  }
  return { ok: true };
}
