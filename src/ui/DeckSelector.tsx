import { useMemo, useState } from "react";
import { ALL_CARDS, AXIS_LABELS, CATEGORY_LABELS } from "../cards";
import type { QuizCard } from "../domain/schema";
import {
  buildTree,
  groupState,
  isSelected,
  setSelected,
  type DeckSelection,
  type TriState,
} from "../domain/selection";
import { isEligible } from "../domain/session";

interface Props {
  selection: DeckSelection;
  onSelectionChange: (next: DeckSelection) => void;
  sessionSize: number;
  onSessionSizeChange: (n: number) => void;
  reviewMode: boolean;
  reported: ReadonlySet<string>;
  onClose: () => void;
}

/** 3状態チェックボックス。色だけに頼らず記号でも区別する */
function Check({ state }: { state: TriState }) {
  const mark = state === "all" ? "✓" : state === "partial" ? "－" : "";
  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border text-sm font-bold ${
        state === "none" ? "border-line bg-ink" : "border-accent bg-accent/20 text-accent"
      }`}
    >
      {mark}
    </span>
  );
}

export function DeckSelector({
  selection,
  onSelectionChange,
  sessionSize,
  onSessionSizeChange,
  reviewMode,
  reported,
  onClose,
}: Props) {
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());
  const [openTechniques, setOpenTechniques] = useState<Set<string>>(new Set());

  // 出題資格のあるカードだけを選択対象にする。
  // 資格のないカードを並べても選べないため、混乱を避けて最初から除く。
  const availableCards = useMemo(
    () => ALL_CARDS.filter((c) => isEligible(c, reviewMode) && !reported.has(c.id)),
    [reviewMode, reported],
  );
  const tree = useMemo(() => buildTree(availableCards), [availableCards]);

  const selectedTotal = availableCards.filter((c) => isSelected(selection, c.id)).length;

  const toggleSet = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  const applyToggle = (cards: readonly QuizCard[], current: TriState) => {
    onSelectionChange(
      setSelected(
        selection,
        cards.map((c) => c.id),
        current !== "all",
      ),
    );
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">出題する内容を選ぶ</h1>
        <button type="button" onClick={onClose} className="shrink-0 rounded border border-line px-3 py-2 text-sm">
          閉じる
        </button>
      </header>

      {availableCards.length === 0 && (
        <p className="rounded-lg border border-line bg-ink-soft p-3 text-sm text-fg-dim">
          出題できるカードがありません。全カードが未レビューの場合は、
          設定からレビューモードを有効にしてください。
        </p>
      )}

      <section className="flex flex-col gap-2 rounded-lg border border-line bg-ink-soft p-4">
        <label className="flex flex-col gap-1">
          <span className="font-medium">1回の出題数: {sessionSize} 枚</span>
          <input
            type="range"
            min={5}
            max={100}
            step={5}
            value={sessionSize}
            onChange={(e) => onSessionSizeChange(Number(e.target.value))}
          />
        </label>
        <p className="text-sm text-fg-dim">
          選択中 <span className="font-bold text-accent">{selectedTotal}</span> 枚 /{" "}
          {availableCards.length} 枚。
          このうち復習期限が来たものから最大 {sessionSize} 枚が出題されます。
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => applyToggle(availableCards, "none")}
            className="flex-1 rounded border border-line px-3 py-2 text-sm"
          >
            すべて選択
          </button>
          <button
            type="button"
            onClick={() => applyToggle(availableCards, "all")}
            className="flex-1 rounded border border-line px-3 py-2 text-sm"
          >
            すべて解除
          </button>
        </div>
      </section>

      <ul className="flex flex-col gap-2">
        {tree.map((cat) => {
          const catState = groupState(selection, cat.cards.map((c) => c.id));
          const catOpen = openCategories.has(cat.category);
          const catSelected = cat.cards.filter((c) => isSelected(selection, c.id)).length;

          return (
            <li key={cat.category} className="rounded-lg border border-line bg-ink-soft">
              <div className="flex items-center gap-2 p-3">
                <button
                  type="button"
                  onClick={() => applyToggle(cat.cards, catState)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  aria-pressed={catState === "all"}
                >
                  <Check state={catState} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">
                      {CATEGORY_LABELS[cat.category] ?? cat.category}
                    </span>
                    <span className="block text-xs text-fg-dim">
                      {catSelected} / {cat.cards.length} 枚 ・ {cat.techniques.length} 技
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setOpenCategories(toggleSet(openCategories, cat.category))}
                  className="shrink-0 rounded border border-line px-3 py-1.5 text-xs"
                  aria-expanded={catOpen}
                >
                  {catOpen ? "閉じる" : "技を選ぶ"}
                </button>
              </div>

              {catOpen && (
                <ul className="flex flex-col gap-1 border-t border-line p-2">
                  {cat.techniques.map((tech) => {
                    const techState = groupState(selection, tech.cards.map((c) => c.id));
                    const techOpen = openTechniques.has(tech.techniqueId);
                    const techSelected = tech.cards.filter((c) => isSelected(selection, c.id)).length;

                    return (
                      <li key={tech.techniqueId} className="rounded border border-line/60 bg-ink">
                        <div className="flex items-center gap-2 p-2">
                          <button
                            type="button"
                            onClick={() => applyToggle(tech.cards, techState)}
                            className="flex min-w-0 flex-1 items-center gap-3 text-left"
                            aria-pressed={techState === "all"}
                          >
                            <Check state={techState} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm">{tech.nameJa}</span>
                              <span className="block text-xs text-fg-dim">
                                {techSelected} / {tech.cards.length} 枚
                              </span>
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setOpenTechniques(toggleSet(openTechniques, tech.techniqueId))}
                            className="shrink-0 rounded border border-line px-2 py-1 text-xs"
                            aria-expanded={techOpen}
                          >
                            {techOpen ? "閉じる" : "問題"}
                          </button>
                        </div>

                        {techOpen && (
                          <ul className="flex flex-col gap-1 border-t border-line/60 p-2">
                            {tech.cards.map((card) => {
                              const on = isSelected(selection, card.id);
                              return (
                                <li key={card.id}>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onSelectionChange(setSelected(selection, [card.id], !on))
                                    }
                                    className="flex w-full items-start gap-3 rounded p-2 text-left"
                                    aria-pressed={on}
                                  >
                                    <Check state={on ? "all" : "none"} />
                                    <span className="min-w-0 flex-1">
                                      <span className="block text-xs text-fg-dim">
                                        {AXIS_LABELS[card.axis] ?? card.axis}
                                      </span>
                                      <span className="block text-sm">{cardTitle(card)}</span>
                                    </span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={onClose}
        className="rounded-lg bg-accent px-4 py-3 font-bold text-ink"
      >
        この内容で確定
      </button>
    </div>
  );
}

function cardTitle(card: QuizCard): string {
  const p = card.payload;
  return p.type === "cloze" ? p.text : p.front;
}
