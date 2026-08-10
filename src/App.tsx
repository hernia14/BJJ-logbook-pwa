import { useCallback, useEffect, useState } from "react";
import { ALL_CARDS } from "./cards";
import { selectSession } from "./domain/session";
import { review, type Quality, type SrsState } from "./domain/srs";
import type { QuizCard } from "./domain/schema";
import {
  appendReviewLog,
  getAllSrsStates,
  getReportedCardIds,
  getSetting,
  reportError,
  saveSrsState,
  setSetting,
} from "./db/db";
import { CardView } from "./ui/CardView";
import { Home } from "./ui/Home";
import { Settings } from "./ui/Settings";

type Screen = "home" | "quiz" | "settings" | "done";

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [loading, setLoading] = useState(true);
  const [states, setStates] = useState<Map<string, SrsState>>(new Map());
  const [reported, setReported] = useState<Set<string>>(new Set());
  const [reviewMode, setReviewMode] = useState(false);
  const [sessionSize, setSessionSize] = useState(20);
  const [queue, setQueue] = useState<QuizCard[]>([]);
  const [position, setPosition] = useState(0);

  const refresh = useCallback(async () => {
    const [s, r, rm, ss] = await Promise.all([
      getAllSrsStates(),
      getReportedCardIds(),
      getSetting("reviewMode", false),
      getSetting("sessionSize", 20),
    ]);
    setStates(s);
    setReported(r);
    setReviewMode(rm);
    setSessionSize(ss);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const startSession = () => {
    const available = ALL_CARDS.filter((c) => !reported.has(c.id));
    const selected = selectSession(available, states, {
      limit: sessionSize,
      includeDrafts: reviewMode,
    });
    if (selected.length === 0) return;
    setQueue(selected);
    setPosition(0);
    setScreen("quiz");
  };

  const handleAnswer = async (quality: Quality, unverifiedOnMat: boolean) => {
    const card = queue[position];
    if (!card) return;

    const current = states.get(card.id) ?? undefined;
    const base = current ?? {
      repetition: 0,
      easeFactor: 2.5,
      intervalDays: 0,
      dueAt: Date.now(),
      lastReviewedAt: null,
      totalReviews: 0,
      lapses: 0,
    };
    const next = review(base, quality, card.safetyLevel);

    await Promise.all([
      saveSrsState(card.id, next),
      appendReviewLog({ cardId: card.id, quality, at: Date.now(), unverifiedOnMat }),
    ]);
    setStates((prev) => new Map(prev).set(card.id, next));

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

  if (screen === "settings") {
    return (
      <Settings
        reviewMode={reviewMode}
        onReviewModeChange={(v) => {
          setReviewMode(v);
          void setSetting("reviewMode", v);
        }}
        sessionSize={sessionSize}
        onSessionSizeChange={(v) => {
          setSessionSize(v);
          void setSetting("sessionSize", v);
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
          onAnswer={(q, u) => void handleAnswer(q, u)}
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
        <button
          type="button"
          onClick={() => setScreen("home")}
          className="rounded-lg bg-accent px-6 py-3 font-bold text-ink"
        >
          ホームへ
        </button>
      </div>
    );
  }

  return (
    <Home
      states={states}
      reported={reported}
      reviewMode={reviewMode}
      sessionSize={sessionSize}
      onStart={startSession}
      onOpenSettings={() => setScreen("settings")}
    />
  );
}
