/**
 * 学習セッションの出題カード選定。純関数。
 *
 * docs/requirements.md §A-6 の「同一技の細部が連続出題される退屈さ」への対策として、
 * 1セッション内で同じ技から出題する枚数に上限を設ける。
 */
import { compareByPriority, isDue, type SrsState } from "./srs";
import type { QuizCard } from "./schema";

/** 1セッション内で同一技から出題できる上限枚数（docs/requirements.md §A-6） */
export const MAX_CARDS_PER_TECHNIQUE = 3;

export interface SessionOptions {
  /** 1セッションの上限枚数 */
  limit: number;
  /** レビューモード。true なら draft カードも出題対象に含める */
  includeDrafts: boolean;
  now?: number;
  maxPerTechnique?: number;
}

/**
 * 出題プールへの参加条件（docs/card-schema.md「出題プールへの参加条件」）。
 * レビューモードのときだけ draft を通す。
 */
export function isEligible(card: QuizCard, includeDrafts: boolean): boolean {
  if (includeDrafts) return true;
  return card.status === "reviewed" && card.reviewedBy !== null;
}

/**
 * セッションで出す順にカードを並べて返す。
 *
 * 1. 出題資格のないカードを除外
 * 2. 期限到来分を優先度順に、続けて未学習分
 * 3. 同一技の連続を避けるため、まず技ごとの上限を守って詰める
 * 4. それでも limit に満たなければ、上限を無視して残りから補充する
 *
 * 4段目が必要な理由: 利用者が1つの技だけを選んで集中的に反復したい場合、
 * 上限をそのまま適用すると選んだカードの大半が出題されない。
 * 上限は「候補が潤沢なときに偏りを避ける」ためのものであって、
 * 出題可能なカードを取りこぼすためのものではない。
 */
export function selectSession(
  cards: readonly QuizCard[],
  states: ReadonlyMap<string, SrsState>,
  options: SessionOptions,
): QuizCard[] {
  const now = options.now ?? Date.now();
  const maxPerTechnique = options.maxPerTechnique ?? MAX_CARDS_PER_TECHNIQUE;

  const eligible = cards.filter((c) => isEligible(c, options.includeDrafts));

  const withState = eligible.map((card) => ({ card, state: states.get(card.id) }));

  // 未学習カードは常に候補。学習済みは期限到来分のみ
  const candidates = withState.filter(({ state }) => !state || isDue(state, now));

  candidates.sort((a, b) => {
    if (!a.state && !b.state) return 0;
    if (!a.state) return 1;
    if (!b.state) return -1;
    return compareByPriority(a.state, b.state);
  });

  const perTechnique = new Map<string, number>();
  const selected: QuizCard[] = [];
  const deferred: QuizCard[] = [];

  for (const { card } of candidates) {
    if (selected.length >= options.limit) break;
    const used = perTechnique.get(card.techniqueId) ?? 0;
    if (used >= maxPerTechnique) {
      deferred.push(card);
      continue;
    }
    perTechnique.set(card.techniqueId, used + 1);
    selected.push(card);
  }

  // 枠が余っているなら、上限で見送ったカードで埋める
  for (const card of deferred) {
    if (selected.length >= options.limit) break;
    selected.push(card);
  }

  return selected;
}

/** 決定的なシャッフル（並べ替え問題の選択肢用）。seed を与えると再現できる */
export function shuffle<T>(items: readonly T[], seed: number): T[] {
  const result = [...items];
  let state = seed >>> 0 || 1;
  const next = () => {
    // xorshift32
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    const a = result[i] as T;
    const b = result[j] as T;
    result[i] = b;
    result[j] = a;
  }
  return result;
}
