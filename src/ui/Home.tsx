import { ALL_CARDS, CATEGORY_LABELS } from "../cards";
import { isEligible } from "../domain/session";
import { isDue, type SrsState } from "../domain/srs";

interface Props {
  states: Map<string, SrsState>;
  reported: Set<string>;
  reviewMode: boolean;
  sessionSize: number;
  onStart: () => void;
  onOpenSettings: () => void;
}

export function Home({
  states,
  reported,
  reviewMode,
  sessionSize,
  onStart,
  onOpenSettings,
}: Props) {
  const eligible = ALL_CARDS.filter((c) => isEligible(c, reviewMode) && !reported.has(c.id));
  const now = Date.now();
  const due = eligible.filter((c) => {
    const s = states.get(c.id);
    return !s || isDue(s, now);
  });
  const learned = eligible.filter((c) => states.get(c.id)?.lastReviewedAt != null);

  const byCategory = new Map<string, number>();
  for (const c of eligible) byCategory.set(c.category, (byCategory.get(c.category) ?? 0) + 1);

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
        <Stat label="今日の出題" value={Math.min(due.length, sessionSize)} accent />
        <Stat label="出題可能" value={eligible.length} />
        <Stat label="学習済み" value={learned.length} />
      </section>

      {eligible.length === 0 ? (
        <div className="rounded-lg border border-line bg-ink-soft p-4 text-sm leading-relaxed">
          <p className="font-bold">出題できるカードがありません。</p>
          <p className="mt-2 text-fg-dim">
            全 {ALL_CARDS.length} 枚は未レビュー（draft）のため出題プールに入っていません。これは仕様です。
            内容を確認するには、設定からレビューモードを有効にしてください。
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={onStart}
          disabled={due.length === 0}
          className="rounded-lg bg-accent px-4 py-4 text-lg font-bold text-ink disabled:opacity-40"
        >
          {due.length === 0 ? "今日の復習は完了" : `学習を始める（${Math.min(due.length, sessionSize)}枚）`}
        </button>
      )}

      <section>
        <h2 className="mb-2 text-sm font-bold text-fg-dim">カテゴリ別（出題可能）</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {[...byCategory.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([cat, n]) => (
              <li key={cat} className="flex justify-between border-b border-line/50 py-1">
                <span>{CATEGORY_LABELS[cat] ?? cat}</span>
                <span className="tabular-nums text-fg-dim">{n}</span>
              </li>
            ))}
        </ul>
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
