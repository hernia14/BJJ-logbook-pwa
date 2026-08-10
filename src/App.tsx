import { useCallback, useEffect, useState } from "react";
import { ALL_CARDS } from "./cards";
import { selectSession } from "./domain/session";
import { EMPTY_SELECTION, filterSelected, type DeckSelection } from "./domain/selection";
import { initialState, review, type Quality, type SrsState } from "./domain/srs";
import type { QuizCard } from "./domain/schema";
import {
  appendReviewLog,
  approveCard,
  deleteReviewLog,
  deleteSrsState,
  getAllSrsStates,
  getReportedCardIds,
  getReviewDecisions,
  getSetting,
  reportError,
  saveSrsState,
  setSetting,
  unapproveCard,
  db,
} from "./db/db";
import { CardView } from "./ui/CardView";
import { DeckSelector } from "./ui/DeckSelector";
import { Home } from "./ui/Home";
import { ReviewScreen } from "./ui/ReviewScreen";
import { Settings } from "./ui/Settings";

type Screen = "home" | "quiz" | "settings" | "deck" | "review" | "done";

/**
 * 「1つ戻る」で解答を取り消すために必要な情報。
 * 解答前のSRS状態を保持しておき、戻る際にそこへ復元する。
 * prevState が undefined のカードは未学習だったため、復元時はレコードごと削除する。
 */
interface AnswerHistoryEntry {
  position: number;
  cardId: string;
  prevState: SrsState | undefined;
  logId: number;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [loading, setLoading] = useState(true);
  const [states, setStates] = useState<Map<string, SrsState>>(new Map());
  const [reported, setReported] = useState<Set<string>>(new Set());
  const [reviewMode, setReviewMode] = useState(false);
  const [sessionSize, setSessionSize] = useState(20);
  const [selection, setSelection] = useState<DeckSelection>(EMPTY_SELECTION);
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const [reviewer, setReviewer] = useState("");
  const [queue, setQueue] = useState<QuizCard[]>([]);
  const [position, setPosition] = useState(0);
  const [history, setHistory] = useState<AnswerHistoryEntry[]>([]);

  const refresh = useCallback(async () => {
    const [s, r, rm, ss, excluded, decisions, rev] = await Promise.all([
      getAllSrsStates(),
      getReportedCardIds(),
      getSetting("reviewMode", false),
      getSetting("sessionSize", 20),
      getSetting<string[]>("excludedCardIds", []),
      getReviewDecisions(),
      getSetting("reviewer", ""),
    ]);
    setStates(s);
    setReported(r);
    setReviewMode(rm);
    setSessionSize(ss);
    setSelection({ excludedCardIds: excluded });
    setApproved(new Set(decisions.keys()));
    setReviewer(rev);
    setLoading(false);
  }, []);

  /** 判定結果を、YAMLへ書き戻すためのJSONとして出力する */
  const exportReview = async () => {
    const [decisions, reports] = await Promise.all([
      getReviewDecisions(),
      db.errorReports.toArray(),
    ]);
    const payload = {
      format: "bjj-drill-review" as const,
      version: 1 as const,
      exportedAt: new Date().toISOString(),
      approved: [...decisions.values()],
      needsFix: reports.map((r) => ({ cardId: r.cardId, note: r.note, reportedAt: r.reportedAt })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bjj-drill-review-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const updateSelection = (next: DeckSelection) => {
    setSelection(next);
    void setSetting("excludedCardIds", next.excludedCardIds);
  };

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const startSession = () => {
    const available = filterSelected(
      selection,
      ALL_CARDS.filter((c) => !reported.has(c.id)),
    );
    const selected = selectSession(available, states, {
      limit: sessionSize,
      includeDrafts: reviewMode,
    });
    if (selected.length === 0) return;
    setQueue(selected);
    setPosition(0);
    setHistory([]);
    setScreen("quiz");
  };

  const handleAnswer = async (quality: Quality, unverifiedOnMat: boolean) => {
    const card = queue[position];
    if (!card) return;

    const prevState = states.get(card.id);
    const base = prevState ?? initialState();
    const next = review(base, quality, card.safetyLevel);

    const [, logId] = await Promise.all([
      saveSrsState(card.id, next),
      appendReviewLog({ cardId: card.id, quality, at: Date.now(), unverifiedOnMat }),
    ]);
    setStates((prev) => new Map(prev).set(card.id, next));
    setHistory((prev) => [...prev, { position, cardId: card.id, prevState, logId }]);

    if (position + 1 >= queue.length) {
      setScreen("done");
    } else {
      setPosition(position + 1);
    }
  };

  /**
   * 1つ戻る。直前の解答を取り消し、SRSの状態と履歴を解答前へ復元する。
   * 誤タップで意図せず出題間隔が伸びたままになるのを防ぐ。
   */
  const handleUndo = async () => {
    const last = history[history.length - 1];
    if (!last) return;

    await deleteReviewLog(last.logId);
    if (last.prevState) {
      await saveSrsState(last.cardId, last.prevState);
    } else {
      await deleteSrsState(last.cardId);
    }

    setStates((prev) => {
      const nextStates = new Map(prev);
      if (last.prevState) nextStates.set(last.cardId, last.prevState);
      else nextStates.delete(last.cardId);
      return nextStates;
    });
    setHistory((prev) => prev.slice(0, -1));
    setPosition(last.position);
    setScreen("quiz");
  };

  /**
   * セッションを途中で終了しホームへ戻る。
   * 解答は1枚ごとに保存済みのため、ここで失われるのは残りのキューだけ。
   * 取り消し履歴は持ち越すと別セッションの解答を巻き戻せてしまうため破棄する。
   */
  const handleExit = () => {
    setQueue([]);
    setHistory([]);
    setPosition(0);
    setScreen("home");
  };

  /**
   * 採点せずに次へ進む。SRSには一切記録しないため、
   * そのカードは期限到来のまま残り、次のセッションでも出題される。
   */
  const handleSkip = () => {
    if (position + 1 >= queue.length) {
      setScreen("done");
    } else {
      setPosition(position + 1);
    }
  };

  const handleReportError = async (note: string) => {
    const card = queue[position];
    if (!card) return;
    await reportError(card.id, note);
    setReported((prev) => new Set(prev).add(card.id));

    // 報告されたカードは以降のキューからも取り除く（requirements §H）
    const rest = queue.filter((c, i) => i <= position || c.id !== card.id);
    setQueue(rest);
    if (position + 1 >= rest.length) {
      setScreen("done");
    } else {
      setPosition(position + 1);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-fg-dim">読み込み中…</div>;
  }

  if (screen === "deck") {
    return (
      <DeckSelector
        selection={selection}
        onSelectionChange={updateSelection}
        sessionSize={sessionSize}
        onSessionSizeChange={(v) => {
          setSessionSize(v);
          void setSetting("sessionSize", v);
        }}
        reviewMode={reviewMode}
        reported={reported}
        onClose={() => setScreen("home")}
      />
    );
  }

  if (screen === "review") {
    return (
      <ReviewScreen
        reviewer={reviewer}
        onReviewerChange={(v) => {
          setReviewer(v);
          void setSetting("reviewer", v);
        }}
        approved={approved}
        reported={reported}
        onApprove={(cardId) => {
          void approveCard(cardId, reviewer.trim());
          setApproved((prev) => new Set(prev).add(cardId));
        }}
        onUnapprove={(cardId) => {
          void unapproveCard(cardId);
          setApproved((prev) => {
            const next = new Set(prev);
            next.delete(cardId);
            return next;
          });
        }}
        onReport={(cardId, note) => {
          void reportError(cardId, note);
          setReported((prev) => new Set(prev).add(cardId));
        }}
        onExport={() => void exportReview()}
        onClose={() => setScreen("home")}
      />
    );
  }

  if (screen === "settings") {
    return (
      <Settings
        reviewMode={reviewMode}
        onReviewModeChange={(v) => {
          setReviewMode(v);
          void setSetting("reviewMode", v);
        }}
        onClose={() => setScreen("home")}
        onDataChanged={() => void refresh()}
      />
    );
  }

  if (screen === "quiz") {
    const card = queue[position];
    if (!card) {
      return <div className="p-8 text-center text-fg-dim">カードがありません。</div>;
    }
    return (
      <div className="mx-auto max-w-2xl">
        <CardView
          key={card.id}
          card={card}
          index={position}
          total={queue.length}
          canUndo={history.length > 0}
          onAnswer={(q, u) => void handleAnswer(q, u)}
          onUndo={() => void handleUndo()}
          onSkip={handleSkip}
          onExit={handleExit}
          onReportError={(note) => void handleReportError(note)}
        />
      </div>
    );
  }

  if (screen === "done") {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 p-8 text-center">
        <h1 className="text-2xl font-bold">セッション完了</h1>
        <p className="text-fg-dim">{queue.length} 枚を復習しました。</p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setScreen("home")}
            className="rounded-lg bg-accent px-6 py-3 font-bold text-ink"
          >
            ホームへ
          </button>
          {history.length > 0 && (
            <button
              type="button"
              onClick={() => void handleUndo()}
              className="rounded-lg border border-line px-6 py-3"
            >
              ← 最後の解答を取り消して戻る
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <Home
      states={states}
      reported={reported}
      reviewMode={reviewMode}
      sessionSize={sessionSize}
      selection={selection}
      approvedCount={approved.size}
      onStart={startSession}
      onOpenSettings={() => setScreen("settings")}
      onOpenDeck={() => setScreen("deck")}
      onOpenReview={() => setScreen("review")}
    />
  );
}
