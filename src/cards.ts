/**
 * カードデータの読み込み。
 *
 * 生成物は scripts/build-content.ts が出力する public/cards.json。
 * JSへ import するとバンドルに埋め込まれ、枚数に比例して起動時の
 * JS解析時間が伸びるため、静的アセットとして取得して JSON.parse する
 * （docs/requirements.md §I）。
 *
 * Service Worker が事前キャッシュするためオフラインでも読める。
 */
import type { QuizCard } from "./domain/schema";

interface CardsPayload {
  generatedAt: string;
  cards: QuizCard[];
}

let cache: CardsPayload | null = null;
let inflight: Promise<CardsPayload> | null = null;

/** カードデータを取得する。二重取得はしない */
export function loadCards(): Promise<CardsPayload> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;

  const url = `${import.meta.env.BASE_URL}cards.json`;
  inflight = fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error(`カードデータを読み込めません (${res.status})`);
      return res.json() as Promise<CardsPayload>;
    })
    .then((payload) => {
      cache = payload;
      inflight = null;
      return payload;
    })
    .catch((e: unknown) => {
      inflight = null;
      throw e;
    });

  return inflight;
}

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
