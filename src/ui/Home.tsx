import { CATEGORY_LABELS } from "../cards";
import { filterSelected, isSelected, type DeckSelection } from "../domain/selection";
import type { QuizCard } from "../domain/schema";
import { isEligible, selectSession } from "../domain/session";
import { type SrsState } from "../domain/srs";

interface Props {
  cards: readonly QuizCard[];
  states: Map<string, SrsState>;
  reported: Set<string>;
  reviewMode: boolean;
  sessionSize: number;
  selection: DeckSelection;
  approvedCount: number;
  onStart: () => void;
  onOpenSettings: () => void;
  onOpenDeck: () => void;
  onOpenReview: () => void;
}

export function Home({
  cards,
  states,
  reported,
  reviewMode,
  sessionSize,
  selection,
  approvedCount,
  onStart,
  onOpenSettings,
  onOpenDeck,
  onOpenReview,
}: Props) {
  const available = cards.filter((c) => isEligible(c, reviewMode) && !reported.has(c.id));
  const eligible = filterSelected(selection, available);
  const excludedByChoice = available.length - eligible.length;
  // 実際の出題と同じ関数で数える。表示枚数と実出題数が食い違わないようにする
  const nextSession = selectSession(eligible, states, {
    limit: sessionSize,
    includeDrafts: reviewMode,
  });
  const learned = eligible.filter((c) => states.get(c.id)?.lastReviewedAt != null);
  const draftCount = cards.filter((c) => c.status === "draft").length;

  const byCategory = new Map<string, { selected: number; total: number }>();
  for (const c of available) {
    const entry = byCategory.get(c.category) ?? { selected: 0, total: 0 };
    entry.total++;
    if (isSelected(selection, c.id)) entry.selected++;
    byCategory.set(c.category, entry);
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">BJJ Drill</h1>
        <button
          type="button"
          onClick={onOpenSettings}
          className="rounded border border-line px-3 py-2 text-sm"
        >
          設定
        </button>
      </header>

      {reviewMode && (
        <div className="rounded-lg border border-caution bg-caution/10 p-3 text-sm">
          <p className="font-bold text-caution">レビューモード</p>
          <p className="mt-1">
            未レビュー（draft）のカードを含めて出題しています。内容は検証されていません。
          </p>
        </div>
      )}

      <section className="grid grid-cols-3 gap-3">
        <Stat label="今日の出題" value={nextSession.length} accent />
        <Stat label="選択中" value={eligible.length} />
        <Stat label="学習済み" value={learned.length} />
      </section>

      {available.length === 0 ? (
        <div className="rounded-lg border border-line bg-ink-soft p-4 text-sm leading-relaxed">
          <p className="font-bold">出題できるカードがありません。</p>
          <p className="mt-2 text-fg-dim">
            全 {cards.length} 枚は未レビュー（draft）のため出題プールに入っていません。これは仕様です。
            内容を確認するには、設定からレビューモードを有効にしてください。
          </p>
        </div>
      ) : eligible.length === 0 ? (
        <div className="rounded-lg border border-caution bg-caution/10 p-4 text-sm leading-relaxed">
          <p className="font-bold text-caution">出題する内容が1つも選ばれていません。</p>
          <p className="mt-2">下の「出題する内容を選ぶ」から、学習したいカテゴリや問題を選んでください。</p>
        </div>
      ) : (
        <button
          type="button"
          onClick={onStart}
          disabled={nextSession.length === 0}
          className="rounded-lg bg-accent px-4 py-4 text-lg font-bold text-ink disabled:opacity-40"
        >
          {nextSession.length === 0 ? "選択範囲の復習は完了" : `学習を始める（${nextSession.length}枚）`}
        </button>
      )}

      <button
        type="button"
        onClick={onOpenDeck}
        className="flex items-center justify-between rounded-lg border border-line bg-ink-soft px-4 py-3 text-left"
      >
        <span>
          <span className="block font-bold">出題する内容を選ぶ</span>
          <span className="mt-0.5 block text-xs text-fg-dim">
            カテゴリ・技・問題ごとに選択、出題数の変更
          </span>
        </span>
        <span aria-hidden="true" className="shrink-0 text-fg-dim">
          ›
        </span>
      </button>

      <button
        type="button"
        onClick={onOpenReview}
        className="flex items-center justify-between rounded-lg border border-line bg-ink-soft px-4 py-3 text-left"
      >
        <span>
          <span className="block font-bold">カードをレビューする</span>
          <span className="mt-0.5 block text-xs text-fg-dim">
            {draftCount > 0
              ? `未レビュー ${draftCount} 枚（うち判定済み ${approvedCount} 枚）`
              : "未レビューのカードはありません"}
          </span>
        </span>
        <span aria-hidden="true" className="shrink-0 text-fg-dim">
          ›
        </span>
      </button>

      <section>
        <h2 className="mb-2 text-sm font-bold text-fg-dim">
          カテゴリ別（選択中 / 出題可能）
        </h2>
        <ul className="flex flex-col gap-1 text-sm">
          {[...byCategory.entries()]
            .sort((a, b) => b[1].total - a[1].total)
            .map(([cat, n]) => (
              <li key={cat} className="flex justify-between border-b border-line/50 py-1">
                <span className={n.selected === 0 ? "text-fg-dim line-through" : ""}>
                  {CATEGORY_LABELS[cat] ?? cat}
                </span>
                <span className="tabular-nums text-fg-dim">
                  <span className={n.selected > 0 ? "text-fg" : ""}>{n.selected}</span> / {n.total}
                </span>
              </li>
            ))}
        </ul>
        {excludedByChoice > 0 && (
          <p className="mt-2 text-xs text-fg-dim">
            自分の選択により {excludedByChoice} 枚を出題対象から外しています。
          </p>
        )}
      </section>

      {reported.size > 0 && (
        <p className="text-sm text-caution">
          誤り報告により {reported.size} 枚が出題から除外されています（設定から確認できます）。
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-ink-soft p-3 text-center">
      <div className={`text-2xl font-bold tabular-nums ${accent ? "text-accent" : ""}`}>{value}</div>
      <div className="mt-1 text-xs text-fg-dim">{label}</div>
    </div>
  );
}
