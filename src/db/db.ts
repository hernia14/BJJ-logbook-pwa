/**
 * ローカル永続化（IndexedDB / Dexie）。
 *
 * サーバは持たず、個人情報も保存しない（docs/requirements.md §I）。
 * 保存するのは学習履歴と設定のみ。端末間の同期はエクスポート/インポートで手動で行う。
 */
import Dexie, { type EntityTable } from "dexie";
import { initialState, type SrsState } from "../domain/srs";
import { validateExportPayload } from "../domain/importGuard";

export interface SrsRecord extends SrsState {
  cardId: string;
}

export interface ReviewLogEntry {
  id?: number;
  cardId: string;
  quality: number;
  at: number;
  /** 「体ではまだ確認していない」印。間隔計算には影響しない（requirements §C） */
  unverifiedOnMat: boolean;
}

/** 誤り報告。報告されたカードは解決するまで出題プールから除外する（requirements §H） */
export interface ErrorReport {
  cardId: string;
  reportedAt: number;
  note: string;
  resolved: boolean;
}

export interface Setting {
  key: string;
  value: unknown;
}

const db = new Dexie("bjj-drill") as Dexie & {
  srs: EntityTable<SrsRecord, "cardId">;
  reviewLog: EntityTable<ReviewLogEntry, "id">;
  errorReports: EntityTable<ErrorReport, "cardId">;
  settings: EntityTable<Setting, "key">;
};

db.version(1).stores({
  srs: "cardId, dueAt, lastReviewedAt",
  reviewLog: "++id, cardId, at",
  errorReports: "cardId, resolved",
  settings: "key",
});

export { db };

export async function getAllSrsStates(): Promise<Map<string, SrsState>> {
  const rows = await db.srs.toArray();
  return new Map(rows.map((r) => [r.cardId, r]));
}

export async function getSrsState(cardId: string): Promise<SrsState> {
  return (await db.srs.get(cardId)) ?? initialState();
}

export async function saveSrsState(cardId: string, state: SrsState): Promise<void> {
  await db.srs.put({ cardId, ...state });
}

export async function appendReviewLog(entry: Omit<ReviewLogEntry, "id">): Promise<void> {
  await db.reviewLog.add(entry);
}

export async function getReportedCardIds(): Promise<Set<string>> {
  const rows = await db.errorReports.filter((r) => !r.resolved).toArray();
  return new Set(rows.map((r) => r.cardId));
}

export async function reportError(cardId: string, note: string): Promise<void> {
  await db.errorReports.put({ cardId, note, reportedAt: Date.now(), resolved: false });
}

export async function resolveErrorReport(cardId: string): Promise<void> {
  await db.errorReports.delete(cardId);
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return row === undefined ? fallback : (row.value as T);
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value });
}

/** エクスポート形式。将来の形式変更に備えてバージョンを持たせる */
export interface ExportPayload {
  format: "bjj-drill-export";
  version: 1;
  exportedAt: string;
  srs: SrsRecord[];
  reviewLog: ReviewLogEntry[];
  errorReports: ErrorReport[];
  settings: Setting[];
}

export async function exportAll(): Promise<ExportPayload> {
  const [srs, reviewLog, errorReports, settings] = await Promise.all([
    db.srs.toArray(),
    db.reviewLog.toArray(),
    db.errorReports.toArray(),
    db.settings.toArray(),
  ]);
  return {
    format: "bjj-drill-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    srs,
    reviewLog,
    errorReports,
    settings,
  };
}

export class ImportFormatError extends Error {}

/**
 * インポート。既存データは置き換える。
 * 形式が違うファイルを読み込んで履歴を壊さないよう、必ず検証してから書き込む。
 */
export async function importAll(raw: unknown): Promise<{ srs: number; log: number }> {
  const check = validateExportPayload(raw);
  if (!check.ok) {
    throw new ImportFormatError(check.error ?? "不正なファイルです");
  }
  const payload = raw as ExportPayload;

  await db.transaction("rw", db.srs, db.reviewLog, db.errorReports, db.settings, async () => {
    await Promise.all([
      db.srs.clear(),
      db.reviewLog.clear(),
      db.errorReports.clear(),
      db.settings.clear(),
    ]);
    await db.srs.bulkPut(payload.srs as SrsRecord[]);
    // id はインポート先で振り直す
    await db.reviewLog.bulkAdd(
      (payload.reviewLog as ReviewLogEntry[]).map(({ id: _id, ...rest }) => rest),
    );
    if (Array.isArray(payload.errorReports)) {
      await db.errorReports.bulkPut(payload.errorReports);
    }
    if (Array.isArray(payload.settings)) {
      await db.settings.bulkPut(payload.settings);
    }
  });

  return { srs: payload.srs.length, log: payload.reviewLog.length };
}

export async function resetAll(): Promise<void> {
  await db.transaction("rw", db.srs, db.reviewLog, db.errorReports, db.settings, async () => {
    await Promise.all([
      db.srs.clear(),
      db.reviewLog.clear(),
      db.errorReports.clear(),
      db.settings.clear(),
    ]);
  });
}
