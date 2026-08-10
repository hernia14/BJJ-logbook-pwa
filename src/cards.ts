/**
 * ビルド時に生成されたカードデータの読み込み口。
 *
 * 生成物は scripts/build-content.ts が出力する src/generated/cards.json。
 * 実行時のYAMLパースを避けて起動を速くするため、静的JSONをバンドルする。
 */
import generated from "./generated/cards.json";
import type { QuizCard } from "./domain/schema";

const data = generated as { generatedAt: string; cards: QuizCard[] };

export const ALL_CARDS: readonly QuizCard[] = data.cards;
export const GENERATED_AT = data.generatedAt;

export const CATEGORY_LABELS: Record<string, string> = {
  positions: "ポジション",
  concepts: "原理・概念",
  "guard-passing": "パスガード",
  sweeps: "スイープ",
  chokes: "絞め技",
  "joint-locks": "関節技",
  escapes: "エスケープ",
  takedowns: "テイクダウン",
  transitions: "トランジション",
  rules: "IBJJFルール",
  terminology: "用語",
  history: "歴史",
  safety: "安全・禁忌",
};

export const AXIS_LABELS: Record<string, string> = {
  definition: "定義",
  requirement: "要件",
  grip: "グリップ",
  angle_weight: "角度・体重",
  procedure: "手順",
  finish: "仕上げ",
  common_mistake: "よくある失敗",
  consequence: "失敗の帰結",
  counter: "カウンター",
  followup: "連携",
  principle: "原理",
  hierarchy: "優劣",
  contraindication: "禁忌",
};
