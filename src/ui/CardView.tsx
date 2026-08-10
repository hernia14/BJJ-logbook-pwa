import { useEffect, useMemo, useState } from "react";
import type { QuizCard } from "../domain/schema";
import { judgeShortAnswer, judgeOrdering } from "../domain/normalize";
import { shuffle } from "../domain/session";
import { QUALITY, type Quality } from "../domain/srs";
import { AXIS_LABELS, CATEGORY_LABELS } from "../cards";
import { DraftBadge, SafetyBadge } from "./SafetyBadge";

interface Props {
  card: QuizCard;
  index: number;
  total: number;
  /** 1つ戻れるか（直前に解答した記録があるか） */
  canUndo: boolean;
  onAnswer: (quality: Quality, unverifiedOnMat: boolean) => void;
  onUndo: () => void;
  onSkip: () => void;
  onExit: () => void;
  onReportError: (note: string) => void;
}

/** 自己採点ボタン。想起品質のみを取る（requirements §C） */
const SELF_GRADES: { quality: Quality; label: string; hint: string; tone: string }[] = [
  { quality: QUALITY.BLACKOUT, label: "全く出ない", hint: "翌日再出題", tone: "bg-critical/20 ring-critical text-critical" },
  { quality: QUALITY.HARD, label: "思い出せず", hint: "翌日再出題", tone: "bg-caution/20 ring-caution text-caution" },
  { quality: QUALITY.GOOD, label: "苦労した", hint: "間隔を維持", tone: "bg-fg-dim/20 ring-fg-dim text-fg" },
  { quality: QUALITY.EASY, label: "思い出せた", hint: "間隔を延長", tone: "bg-accent/20 ring-accent text-accent" },
  { quality: QUALITY.PERFECT, label: "即答", hint: "大きく延長", tone: "bg-ok/20 ring-ok text-ok" },
];

export function CardView({
  card,
  index,
  total,
  canUndo,
  onAnswer,
  onUndo,
  onSkip,
  onExit,
  onReportError,
}: Props) {
  const [revealed, setRevealed] = useState(false);
  const [input, setInput] = useState("");
  const [autoResult, setAutoResult] = useState<boolean | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportNote, setReportNote] = useState("");
  const [order, setOrder] = useState<number[]>([]);

  const p = card.payload;

  // 並べ替えは決定的にシャッフルする。カードidから種を作り、同一カードでは同じ並びにする
  const shuffledSteps = useMemo(() => {
    if (p.type !== "ordering") return [];
    const seed = [...card.id].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    return shuffle(
      p.steps.map((text, originalIndex) => ({ text, originalIndex })),
      seed,
    );
  }, [card.id, p]);

  useEffect(() => {
    setRevealed(false);
    setInput("");
    setAutoResult(null);
    setUnverified(false);
    setShowReport(false);
    setReportNote("");
    setOrder([]);
  }, [card.id]);

  const reveal = () => {
    if (p.type === "short_answer") {
      setAutoResult(judgeShortAnswer(input, p.answer, [...p.accept, ...card.techniqueAliases]).correct);
    } else if (p.type === "cloze") {
      setAutoResult(judgeShortAnswer(input, p.answer).correct);
    } else if (p.type === "ordering") {
      const chosen = order.map((i) => shuffledSteps[i]?.originalIndex ?? -1);
      setAutoResult(judgeOrdering(chosen, p.steps.length));
    }
    setRevealed(true);
  };

  const toggleStep = (i: number) => {
    setOrder((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));
  };

  return (
    <div className="flex min-h-full flex-col gap-4 p-4">
      <header className="flex items-center gap-2 text-sm text-fg-dim">
        <span className="shrink-0 tabular-nums">
          {index + 1} / {total}
        </span>
        <span className="truncate">{card.techniqueNameJa}</span>
        <button
          type="button"
          onClick={onExit}
          className="ml-auto shrink-0 rounded border border-line px-3 py-1.5 text-xs"
        >
          終了
        </button>
      </header>

      <div className="flex flex-wrap gap-2 text-sm">
        <span className="rounded bg-ink-soft px-2 py-0.5 text-fg-dim">
          {CATEGORY_LABELS[card.category] ?? card.category}
        </span>
        <span className="rounded bg-ink-soft px-2 py-0.5 text-fg-dim">
          {AXIS_LABELS[card.axis] ?? card.axis}
        </span>
        <SafetyBadge level={card.safetyLevel} />
        {card.status === "draft" && <DraftBadge />}
      </div>

      <nav className="flex gap-2" aria-label="問題の移動">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          className="flex-1 rounded border border-line px-3 py-2 text-sm disabled:opacity-30"
        >
          ← 1つ戻る
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="flex-1 rounded border border-line px-3 py-2 text-sm"
        >
          採点せず次へ →
        </button>
      </nav>

      <section className="rounded-lg border border-line bg-ink-soft p-4">
        <h2 className="text-lg leading-relaxed font-medium whitespace-pre-wrap">
          {p.type === "cloze" ? p.text : p.front}
        </h2>

        {(p.type === "short_answer" || p.type === "cloze") && !revealed && (
          <input
            className="mt-4 w-full rounded border border-line bg-ink px-3 py-2 text-base"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="解答を入力"
            autoComplete="off"
            aria-label="解答入力"
          />
        )}

        {p.type === "ordering" && !revealed && (
          <ol className="mt-4 flex flex-col gap-2">
            {shuffledSteps.map((step, i) => {
              const pos = order.indexOf(i);
              return (
                <li key={step.originalIndex}>
                  <button
                    type="button"
                    onClick={() => toggleStep(i)}
                    className={`flex w-full items-start gap-3 rounded border px-3 py-2 text-left ${
                      pos >= 0 ? "border-accent bg-accent/10" : "border-line bg-ink"
                    }`}
                  >
                    <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line text-xs tabular-nums">
                      {pos >= 0 ? pos + 1 : ""}
                    </span>
                    <span>{step.text}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}

        {p.type === "multiple_choice" && !revealed && (
          <ul className="mt-4 flex flex-col gap-2">
            {p.choices.map((choice, i) => (
              <li key={choice}>
                <button
                  type="button"
                  onClick={() => {
                    setAutoResult(i === p.answer_index);
                    setRevealed(true);
                  }}
                  className="w-full rounded border border-line bg-ink px-3 py-2 text-left"
                >
                  {choice}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!revealed && p.type !== "multiple_choice" && (
        <button
          type="button"
          onClick={reveal}
          className="rounded-lg bg-accent px-4 py-3 font-bold text-ink"
        >
          答えを見る
        </button>
      )}

      {revealed && (
        <>
          {autoResult !== null && (
            <div
              className={`rounded-lg px-4 py-3 font-bold ${
                autoResult ? "bg-ok/20 text-ok" : "bg-critical/20 text-critical"
              }`}
            >
              {autoResult ? "◯ 正解" : "× 不正解"}
            </div>
          )}

          <section className="rounded-lg border border-line bg-ink-soft p-4">
            <h3 className="mb-2 text-sm font-bold text-fg-dim">答え</h3>
            <Answer card={card} />
          </section>

          <label className="flex items-center gap-2 text-sm text-fg-dim">
            <input
              type="checkbox"
              checked={unverified}
              onChange={(e) => setUnverified(e.target.checked)}
              className="h-5 w-5"
            />
            体ではまだ確認していない（出題間隔には影響しません）
          </label>

          <div>
            <p className="mb-2 text-sm text-fg-dim">思い出せた度合いを選ぶ</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {SELF_GRADES.map((g) => (
                <button
                  key={g.quality}
                  type="button"
                  onClick={() => onAnswer(g.quality, unverified)}
                  className={`flex items-center justify-between rounded-lg px-4 py-3 text-left ring-1 ${g.tone}`}
                >
                  <span className="font-bold">{g.label}</span>
                  <span className="text-xs opacity-80">{g.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <details className="text-sm text-fg-dim">
            <summary className="cursor-pointer">出典</summary>
            <ul className="mt-2 flex flex-col gap-1 break-all">
              {card.sources.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </details>

          {!showReport ? (
            <button
              type="button"
              onClick={() => setShowReport(true)}
              className="self-start text-sm text-caution underline"
            >
              このカードの内容に誤りがある
            </button>
          ) : (
            <div className="flex flex-col gap-2 rounded-lg border border-caution bg-caution/10 p-3">
              <p className="text-sm">
                報告するとこのカードは出題プールから除外され、解決するまで出題されません。
              </p>
              <textarea
                className="w-full rounded border border-line bg-ink px-3 py-2 text-sm"
                rows={3}
                value={reportNote}
                onChange={(e) => setReportNote(e.target.value)}
                placeholder="どこが誤っているか（任意）"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onReportError(reportNote)}
                  className="rounded bg-caution px-4 py-2 font-bold text-ink"
                >
                  報告して除外する
                </button>
                <button
                  type="button"
                  onClick={() => setShowReport(false)}
                  className="rounded border border-line px-4 py-2"
                >
                  やめる
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Answer({ card }: { card: QuizCard }) {
  const p = card.payload;
  switch (p.type) {
    case "free_recall":
      return <p className="leading-relaxed whitespace-pre-wrap">{p.back}</p>;
    case "short_answer":
      return (
        <div className="flex flex-col gap-2">
          <p className="text-lg font-bold">{p.answer}</p>
          {p.accept.length > 0 && (
            <p className="text-sm text-fg-dim">許容表記: {p.accept.join("、")}</p>
          )}
          {p.note && <p className="text-sm text-fg-dim">{p.note}</p>}
        </div>
      );
    case "ordering":
      return (
        <ol className="flex list-decimal flex-col gap-1 pl-5">
          {p.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      );
    case "true_false":
      return (
        <div className="flex flex-col gap-2">
          <p className="text-lg font-bold">{p.answer ? "正しい" : "誤り"}</p>
          <p className="leading-relaxed whitespace-pre-wrap">{p.explanation}</p>
        </div>
      );
    case "multiple_choice":
      return <p className="text-lg font-bold">{p.choices[p.answer_index]}</p>;
    case "cloze":
      return <p className="text-lg font-bold">{p.answer}</p>;
  }
}
