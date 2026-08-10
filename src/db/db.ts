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

/**
 * カード内容のレビュー判定（承認）。
 *
 * これはあくまで端末上の下書きであり、真実源は content/ のYAML。
 * `npm run apply-review` でエクスポートしたJSONをYAMLへ書き戻し、
 * Gitにコミットして初めて確定する（CLAUDE.md / requirements §H）。
 */
export interface ReviewDecision {
  cardId: string;
  reviewer: string;
  decidedAt: number;
}

const db = new Dexie("bjj-drill") as Dexie & {
  srs: EntityTable<SrsRecord, "cardId">;
  reviewLog: EntityTable<ReviewLogEntry, "id">;
  errorReports: EntityTable<ErrorReport, "cardId">;
  settings: EntityTable<Setting, "key">;
  reviewDecisions: EntityTable<ReviewDecision, "cardId">;
};

db.version(1).stores({
  srs: "cardId, dueAt, lastReviewedAt",
  reviewLog: "++id, cardId, at",
  errorReports: "cardId, resolved",
  settings: "key",
});

db.version(2).stores({
  reviewDecisions: "cardId, decidedAt",
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

/** 追記した履歴のidを返す。取り消し（1つ戻る）で削除するために使う */
export async function appendReviewLog(entry: Omit<ReviewLogEntry, "id">): Promise<number> {
  return (await db.reviewLog.add(entry as ReviewLogEntry)) as number;
}

export async function deleteReviewLog(id: number): Promise<void> {
  await db.reviewLog.delete(id);
}

/** 未学習の状態へ戻す。取り消しで、初回解答前の状態に復元する場合に使う */
export async function deleteSrsState(cardId: string): Promise<void> {
  await db.srs.delete(cardId);
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

export async function getReviewDecisions(): Promise<Map<string, ReviewDecision>> {
  const rows = await db.reviewDecisions.toArray();
  return new Map(rows.map((r) => [r.cardId, r]));
}

export async function approveCard(cardId: string, reviewer: string): Promise<void> {
  await db.reviewDecisions.put({ cardId, reviewer, decidedAt: Date.now() });
}

export async function unapproveCard(cardId: string): Promise<void> {
  await db.reviewDecisions.delete(cardId);
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
  reviewDecisions?: ReviewDecision[];
}

export async function exportAll(): Promise<ExportPayload> {
  const [srs, reviewLog, errorReports, settings, reviewDecisions] = await Promise.all([
    db.srs.toArray(),
    db.reviewLog.toArray(),
    db.errorReports.toArray(),
    db.settings.toArray(),
    db.reviewDecisions.toArray(),
  ]);
  return {
    format: "bjj-drill-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    srs,
    reviewLog,
    errorReports,
    settings,
    reviewDecisions,
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

  await db.transaction(
    "rw",
    db.srs,
    db.reviewLog,
    db.errorReports,
    db.settings,
    db.reviewDecisions,
    async () => {
    await Promise.all([
      db.srs.clear(),
      db.reviewLog.clear(),
      db.errorReports.clear(),
      db.settings.clear(),
      db.reviewDecisions.clear(),
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
      if (Array.isArray(payload.reviewDecisions)) {
        await db.reviewDecisions.bulkPut(payload.reviewDecisions);
      }
    },
  );

  return { srs: payload.srs.length, log: payload.reviewLog.length };
}

export async function resetAll(): Promise<void> {
  await db.transaction(
    "rw",
    db.srs,
    db.reviewLog,
    db.errorReports,
    db.settings,
    db.reviewDecisions,
    async () => {
      await Promise.all([
        db.srs.clear(),
        db.reviewLog.clear(),
        db.errorReports.clear(),
        db.settings.clear(),
        db.reviewDecisions.clear(),
      ]);
    },
  );
}
