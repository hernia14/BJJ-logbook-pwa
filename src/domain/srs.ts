/**
 * 間隔反復スケジューラ（SM-2）。純関数のみ。
 *
 * 設計判断は docs/requirements.md §C を参照:
 * - FSRS ではなく SM-2 を採用（実装コスト・パラメータ調整不要・コールドスタート耐性）
 * - 間隔計算に使うのは「想起品質」のみ。「体で覚えたか」は間隔に影響させない
 * - 安全カードは §F に基づき最大間隔に上限を設ける
 */
import type { SafetyLevel } from "./schema";

/** 想起品質。SM-2 の 0〜5 に対応する */
export const QUALITY = {
  /** 全く思い出せない */
  BLACKOUT: 0,
  /** 答えを見て思い出した */
  HARD: 2,
  /** 苦労したが思い出せた */
  GOOD: 3,
  /** 少し迷ったが思い出せた */
  EASY: 4,
  /** 即座に思い出せた */
  PERFECT: 5,
} as const;

export type Quality = 0 | 1 | 2 | 3 | 4 | 5;

/** 正解とみなす下限。SM-2 の定義に従う */
export const PASSING_QUALITY = 3;

export interface SrsState {
  /** 連続正解回数 */
  repetition: number;
  /** 易しさ係数 */
  easeFactor: number;
  /** 次回までの間隔（日） */
  intervalDays: number;
  /** 次回出題日（epoch ms） */
  dueAt: number;
  /** 直近の復習日時（epoch ms）。未学習なら null */
  lastReviewedAt: number | null;
  /** 総復習回数 */
  totalReviews: number;
  /** 総失敗回数 */
  lapses: number;
}

export const MIN_EASE_FACTOR = 1.3;
export const INITIAL_EASE_FACTOR = 2.5;

/**
 * 安全度別の最大間隔（日）。docs/requirements.md §F の「復習頻度の下限保証」。
 * どれだけ習熟しても、この間隔を超えて出題が空くことはない。
 */
export const MAX_INTERVAL_BY_SAFETY: Record<SafetyLevel, number> = {
  none: 365,
  caution: 60,
  critical: 30,
};

export function initialState(now: number = Date.now()): SrsState {
  return {
    repetition: 0,
    easeFactor: INITIAL_EASE_FACTOR,
    intervalDays: 0,
    dueAt: now,
    lastReviewedAt: null,
    totalReviews: 0,
    lapses: 0,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 1回の解答を反映した次の状態を返す。
 *
 * @param quality 想起品質 0〜5
 * @param safetyLevel 最大間隔の上限決定に使う
 */
export function review(
  state: SrsState,
  quality: Quality,
  safetyLevel: SafetyLevel = "none",
  now: number = Date.now(),
): SrsState {
  const passed = quality >= PASSING_QUALITY;

  // 易しさ係数の更新（SM-2 の標準式）。失敗時も更新する
  const rawEase =
    state.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  const easeFactor = Math.max(MIN_EASE_FACTOR, Number(rawEase.toFixed(4)));

  let repetition: number;
  let intervalDays: number;

  if (!passed) {
    // 失敗したら最初からやり直し、翌日に再出題する
    repetition = 0;
    intervalDays = 1;
  } else {
    repetition = state.repetition + 1;
    if (repetition === 1) {
      intervalDays = 1;
    } else if (repetition === 2) {
      intervalDays = 6;
    } else {
      intervalDays = Math.round(state.intervalDays * easeFactor);
    }
  }

  const cap = MAX_INTERVAL_BY_SAFETY[safetyLevel];
  intervalDays = Math.min(Math.max(intervalDays, 1), cap);

  return {
    repetition,
    easeFactor,
    intervalDays,
    dueAt: now + intervalDays * DAY_MS,
    lastReviewedAt: now,
    totalReviews: state.totalReviews + 1,
    lapses: state.lapses + (passed ? 0 : 1),
  };
}

/** 出題対象か（期限到来済みか） */
export function isDue(state: SrsState, now: number = Date.now()): boolean {
  return state.dueAt <= now;
}

/**
 * 出題順を決める。期限超過が長いものを優先し、未学習カードはその後に置く。
 * 同一技のカードが連続しないよう間引くのは selectSession 側の責務。
 */
export function compareByPriority(a: SrsState, b: SrsState): number {
  const aNew = a.lastReviewedAt === null;
  const bNew = b.lastReviewedAt === null;
  if (aNew !== bNew) return aNew ? 1 : -1;
  return a.dueAt - b.dueAt;
}
