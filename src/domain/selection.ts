/**
 * 出題対象の選択（デッキ選択）。純関数。
 *
 * 保存するのは「除外したカードID」であって「選んだカードID」ではない。
 * こうしておくと、後から content/ にカードを追加したとき、
 * 既存の選択を壊さずに新しいカードが自動的に出題対象へ入る。
 * 「選んだID」を保存する方式だと、追加したカードが永久に出題されない事故が起きる。
 */
import type { QuizCard } from "./schema";

export interface DeckSelection {
  excludedCardIds: readonly string[];
}

export const EMPTY_SELECTION: DeckSelection = { excludedCardIds: [] };

/** 集合の選択状態。チェックボックスの3状態に対応する */
export type TriState = "all" | "none" | "partial";

export function isSelected(selection: DeckSelection, cardId: string): boolean {
  return !selection.excludedCardIds.includes(cardId);
}

/** 指定したカード群をまとめて選択／解除する */
export function setSelected(
  selection: DeckSelection,
  cardIds: readonly string[],
  selected: boolean,
): DeckSelection {
  const excluded = new Set(selection.excludedCardIds);
  for (const id of cardIds) {
    if (selected) excluded.delete(id);
    else excluded.add(id);
  }
  return { excludedCardIds: [...excluded] };
}

/** カード群の選択状態を返す。空集合は none 扱い */
export function groupState(selection: DeckSelection, cardIds: readonly string[]): TriState {
  if (cardIds.length === 0) return "none";
  let selected = 0;
  for (const id of cardIds) if (isSelected(selection, id)) selected++;
  if (selected === 0) return "none";
  if (selected === cardIds.length) return "all";
  return "partial";
}

/** 選択されているカードだけを返す */
export function filterSelected(
  selection: DeckSelection,
  cards: readonly QuizCard[],
): QuizCard[] {
  return cards.filter((c) => isSelected(selection, c.id));
}

export interface TechniqueNode {
  techniqueId: string;
  nameJa: string;
  cards: QuizCard[];
}

export interface CategoryNode {
  category: string;
  techniques: TechniqueNode[];
  cards: QuizCard[];
}

/**
 * カード配列を カテゴリ → 技 の2階層にまとめる。
 * 並び順は入力順を保つ（ビルド時にファイル名順で安定している）。
 */
export function buildTree(cards: readonly QuizCard[]): CategoryNode[] {
  const categories = new Map<string, Map<string, TechniqueNode>>();

  for (const card of cards) {
    let techniques = categories.get(card.category);
    if (!techniques) {
      techniques = new Map();
      categories.set(card.category, techniques);
    }
    let node = techniques.get(card.techniqueId);
    if (!node) {
      node = { techniqueId: card.techniqueId, nameJa: card.techniqueNameJa, cards: [] };
      techniques.set(card.techniqueId, node);
    }
    node.cards.push(card);
  }

  return [...categories.entries()].map(([category, techniques]) => {
    const list = [...techniques.values()];
    return {
      category,
      techniques: list,
      cards: list.flatMap((t) => t.cards),
    };
  });
}
