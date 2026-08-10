import { useMemo, useState } from "react";
import { ALL_CARDS, AXIS_LABELS, CATEGORY_LABELS } from "../cards";
import type { QuizCard } from "../domain/schema";
import { buildTree } from "../domain/selection";
import { DraftBadge, SafetyBadge } from "./SafetyBadge";

interface Props {
  reviewer: string;
  onReviewerChange: (v: string) => void;
  approved: ReadonlySet<string>;
  reported: ReadonlySet<string>;
  onApprove: (cardId: string) => void;
  onUnapprove: (cardId: string) => void;
  onReport: (cardId: string, note: string) => void;
  onExport: () => void;
  onClose: () => void;
}

type Filter = "unreviewed" | "approved" | "reported" | "all";

const FILTER_LABELS: Record<Filter, string> = {
  unreviewed: "未判定",
  approved: "承認済み",
  reported: "要修正",
  all: "すべて",
};

export function ReviewScreen({
  reviewer,
  onReviewerChange,
  approved,
  reported,
  onApprove,
  onUnapprove,
  onReport,
  onExport,
  onClose,
}: Props) {
  const [filter, setFilter] = useState<Filter>("unreviewed");
  const [category, setCategory] = useState<string>("all");
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [reportNote, setReportNote] = useState("");

  // 既にYAML側で承認済みのカードは対象外。判定が必要なのは draft のみ
  const target = useMemo(() => ALL_CARDS.filter((c) => c.status === "draft"), []);

  const categories = useMemo(
    () => buildTree(target).map((n) => ({ key: n.category, count: n.cards.length })),
    [target],
  );

  const visible = useMemo(() => {
    return target.filter((c) => {
      if (category !== "all" && c.category !== category) return false;
      const isApproved = approved.has(c.id);
      const isReported = reported.has(c.id);
      switch (filter) {
        case "unreviewed":
          return !isApproved && !isReported;
        case "approved":
          return isApproved;
        case "reported":
          return isReported;
        case "all":
          return true;
      }
    });
  }, [target, category, filter, approved, reported]);

  const decided = target.filter((c) => approved.has(c.id) || reported.has(c.id)).length;
  const progress = target.length === 0 ? 0 : Math.round((decided / target.length) * 100);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">カードをレビューする</h1>
        <button type="button" onClick={onClose} className="shrink-0 rounded border border-line px-3 py-2 text-sm">
          閉じる
        </button>
      </header>

      <section className="flex flex-col gap-3 rounded-lg border border-line bg-ink-soft p-4">
        <div>
          <div className="mb-1 flex justify-between text-sm">
            <span>判定済み</span>
            <span className="tabular-nums">
              {decided} / {target.length}（{progress}%）
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded bg-ink">
            <div className="h-full bg-accent" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">レビュー者名（YAMLの reviewed_by に入ります）</span>
          <input
            className="w-full rounded border border-line bg-ink px-3 py-2"
            value={reviewer}
            onChange={(e) => onReviewerChange(e.target.value)}
            placeholder="例: hernia14"
            autoComplete="off"
          />
        </label>

        <p className="text-sm text-fg-dim">
          ここでの判定は端末上の下書きです。エクスポートしたJSONを
          <code className="mx-1 rounded bg-ink px-1">npm run apply-review</code>
          でYAMLへ書き戻し、Gitへコミットして確定します。
        </p>
        <button
          type="button"
          onClick={onExport}
          disabled={decided === 0}
          className="rounded bg-accent px-4 py-2 font-bold text-ink disabled:opacity-40"
        >
          判定結果をエクスポート（{decided}件）
        </button>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(FILTER_LABELS) as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded px-3 py-1.5 text-sm ${
                filter === f ? "bg-accent font-bold text-ink" : "border border-line"
              }`}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>
        <select
          className="w-full rounded border border-line bg-ink px-3 py-2"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="カテゴリで絞り込む"
        >
          <option value="all">すべてのカテゴリ（{target.length}枚）</option>
          {categories.map((c) => (
            <option key={c.key} value={c.key}>
              {CATEGORY_LABELS[c.key] ?? c.key}（{c.count}枚）
            </option>
          ))}
        </select>
      </section>

      <p className="text-sm text-fg-dim">{visible.length} 枚を表示中</p>

      <ul className="flex flex-col gap-3">
        {visible.slice(0, 50).map((card) => (
          <ReviewCard
            key={card.id}
            card={card}
            approved={approved.has(card.id)}
            reported={reported.has(card.id)}
            reviewer={reviewer}
            reporting={reportingId === card.id}
            reportNote={reportNote}
            onReportNoteChange={setReportNote}
            onStartReport={() => {
              setReportingId(card.id);
              setReportNote("");
            }}
            onCancelReport={() => setReportingId(null)}
            onSubmitReport={() => {
              onReport(card.id, reportNote);
              setReportingId(null);
            }}
            onApprove={() => onApprove(card.id)}
            onUnapprove={() => onUnapprove(card.id)}
          />
        ))}
      </ul>

      {visible.length > 50 && (
        <p className="text-center text-sm text-fg-dim">
          残り {visible.length - 50} 枚は、上の50枚を判定すると表示されます。
        </p>
      )}
      {visible.length === 0 && (
        <p className="rounded-lg border border-line bg-ink-soft p-4 text-center text-sm text-fg-dim">
          該当するカードがありません。
        </p>
      )}
    </div>
  );
}

interface CardProps {
  card: QuizCard;
  approved: boolean;
  reported: boolean;
  reviewer: string;
  reporting: boolean;
  reportNote: string;
  onReportNoteChange: (v: string) => void;
  onStartReport: () => void;
  onCancelReport: () => void;
  onSubmitReport: () => void;
  onApprove: () => void;
  onUnapprove: () => void;
}

function ReviewCard({
  card,
  approved,
  reported,
  reviewer,
  reporting,
  reportNote,
  onReportNoteChange,
  onStartReport,
  onCancelReport,
  onSubmitReport,
  onApprove,
  onUnapprove,
}: CardProps) {
  const p = card.payload;
  return (
    <li
      className={`rounded-lg border p-3 ${
        approved
          ? "border-ok/60 bg-ok/5"
          : reported
            ? "border-caution/60 bg-caution/5"
            : "border-line bg-ink-soft"
      }`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-fg-dim">
        <span className="rounded bg-ink px-2 py-0.5">
          {CATEGORY_LABELS[card.category] ?? card.category}
        </span>
        <span className="rounded bg-ink px-2 py-0.5">{AXIS_LABELS[card.axis] ?? card.axis}</span>
        <span className="truncate">{card.techniqueNameJa}</span>
      </div>

      <div className="mb-2 flex flex-wrap gap-2">
        <SafetyBadge level={card.safetyLevel} />
        {!approved && !reported && <DraftBadge />}
        {approved && (
          <span className="rounded bg-ok/20 px-2 py-0.5 text-xs font-bold text-ok ring-1 ring-ok">
            ✓ 承認済み
          </span>
        )}
        {reported && (
          <span className="rounded bg-caution/20 px-2 py-0.5 text-xs font-bold text-caution ring-1 ring-caution">
            ⚠ 要修正
          </span>
        )}
      </div>

      <p className="font-medium">{p.type === "cloze" ? p.text : p.front}</p>
      <div className="mt-2 border-t border-line pt-2 text-sm leading-relaxed whitespace-pre-wrap">
        <Answer card={card} />
      </div>

      {reporting ? (
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            className="w-full rounded border border-line bg-ink px-3 py-2 text-sm"
            rows={2}
            value={reportNote}
            onChange={(e) => onReportNoteChange(e.target.value)}
            placeholder="どこが誤っているか"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onSubmitReport}
              className="flex-1 rounded bg-caution px-3 py-2 text-sm font-bold text-ink"
            >
              要修正として記録
            </button>
            <button
              type="button"
              onClick={onCancelReport}
              className="rounded border border-line px-3 py-2 text-sm"
            >
              やめる
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          {approved ? (
            <button
              type="button"
              onClick={onUnapprove}
              className="flex-1 rounded border border-line px-3 py-2 text-sm"
            >
              承認を取り消す
            </button>
          ) : (
            <button
              type="button"
              onClick={onApprove}
              disabled={reviewer.trim() === ""}
              title={reviewer.trim() === "" ? "先にレビュー者名を入力してください" : undefined}
              className="flex-1 rounded bg-ok/20 px-3 py-2 text-sm font-bold text-ok ring-1 ring-ok disabled:opacity-40"
            >
              ✓ 承認する
            </button>
          )}
          {!reported && (
            <button
              type="button"
              onClick={onStartReport}
              className="rounded border border-caution px-3 py-2 text-sm text-caution"
            >
              要修正
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function Answer({ card }: { card: QuizCard }) {
  const p = card.payload;
  switch (p.type) {
    case "free_recall":
      return <>{p.back}</>;
    case "short_answer":
      return (
        <>
          {p.answer}
          {p.accept.length > 0 && (
            <span className="block text-fg-dim">許容: {p.accept.join("、")}</span>
          )}
        </>
      );
    case "ordering":
      return (
        <ol className="list-decimal pl-5">
          {p.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      );
    case "true_false":
      return (
        <>
          {p.answer ? "正しい" : "誤り"} — {p.explanation}
        </>
      );
    case "multiple_choice":
      return <>{p.choices[p.answer_index]}</>;
    case "cloze":
      return <>{p.answer}</>;
  }
}
