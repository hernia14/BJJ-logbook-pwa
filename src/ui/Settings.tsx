import { useRef, useState } from "react";
import { ALL_CARDS, GENERATED_AT } from "../cards";
import {
  exportAll,
  importAll,
  ImportFormatError,
  resetAll,
  resolveErrorReport,
  db,
} from "../db/db";

interface Props {
  reviewMode: boolean;
  onReviewModeChange: (v: boolean) => void;
  sessionSize: number;
  onSessionSizeChange: (v: number) => void;
  onClose: () => void;
  onDataChanged: () => void;
}

export function Settings({
  reviewMode,
  onReviewModeChange,
  sessionSize,
  onSessionSizeChange,
  onClose,
  onDataChanged,
}: Props) {
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [reports, setReports] = useState<{ cardId: string; note: string }[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    const payload = await exportAll();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bjj-drill-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage({ tone: "ok", text: "エクスポートしました。" });
  };

  const handleImport = async (file: File) => {
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const result = await importAll(parsed);
      onDataChanged();
      setMessage({
        tone: "ok",
        text: `インポートしました（学習状態 ${result.srs} 件 / 履歴 ${result.log} 件）。`,
      });
    } catch (e) {
      const text =
        e instanceof ImportFormatError
          ? e.message
          : e instanceof SyntaxError
            ? "JSONとして読み取れませんでした。"
            : "インポートに失敗しました。";
      setMessage({ tone: "error", text });
    }
  };

  const handleReset = async () => {
    if (!confirm("学習履歴をすべて削除します。元に戻せません。続けますか？")) return;
    await resetAll();
    onDataChanged();
    setMessage({ tone: "ok", text: "学習履歴を削除しました。" });
  };

  const loadReports = async () => {
    const rows = await db.errorReports.toArray();
    setReports(rows.map((r) => ({ cardId: r.cardId, note: r.note })));
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">設定</h1>
        <button type="button" onClick={onClose} className="rounded border border-line px-3 py-2 text-sm">
          閉じる
        </button>
      </header>

      {message && (
        <p
          className={`rounded-lg p-3 text-sm ${
            message.tone === "ok" ? "bg-ok/20 text-ok" : "bg-critical/20 text-critical"
          }`}
          role="status"
        >
          {message.text}
        </p>
      )}

      <section className="flex flex-col gap-3 rounded-lg border border-line bg-ink-soft p-4">
        <h2 className="font-bold">出題</h2>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={reviewMode}
            onChange={(e) => onReviewModeChange(e.target.checked)}
            className="mt-1 h-5 w-5"
          />
          <span>
            <span className="font-medium">レビューモード</span>
            <span className="mt-1 block text-sm text-fg-dim">
              未レビュー（draft）のカードも出題する。内容が検証されていないため、
              確認作業のときだけ有効にする。
            </span>
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-medium">1セッションの枚数: {sessionSize}</span>
          <input
            type="range"
            min={5}
            max={50}
            step={5}
            value={sessionSize}
            onChange={(e) => onSessionSizeChange(Number(e.target.value))}
          />
          <span className="text-sm text-fg-dim">1日10分の目安は20枚前後。</span>
        </label>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-line bg-ink-soft p-4">
        <h2 className="font-bold">学習履歴</h2>
        <p className="text-sm text-fg-dim">
          データはこの端末の中だけに保存されます。サーバへは一切送信しません。
          ブラウザのサイトデータを消すと履歴も消えるため、定期的にエクスポートしてください。
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={handleExport} className="rounded bg-accent px-4 py-2 font-bold text-ink">
            エクスポート
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded border border-line px-4 py-2"
          >
            インポート
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleImport(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={handleReset}
            className="rounded border border-critical px-4 py-2 text-critical"
          >
            履歴を削除
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-line bg-ink-soft p-4">
        <h2 className="font-bold">誤り報告</h2>
        {reports === null ? (
          <button type="button" onClick={loadReports} className="self-start rounded border border-line px-4 py-2">
            報告一覧を表示
          </button>
        ) : reports.length === 0 ? (
          <p className="text-sm text-fg-dim">報告はありません。</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {reports.map((r) => (
              <li key={r.cardId} className="rounded border border-line p-2 text-sm">
                <div className="font-mono text-xs text-fg-dim">{r.cardId}</div>
                {r.note && <p className="mt-1">{r.note}</p>}
                <button
                  type="button"
                  onClick={async () => {
                    await resolveErrorReport(r.cardId);
                    onDataChanged();
                    await loadReports();
                  }}
                  className="mt-2 rounded border border-line px-3 py-1 text-xs"
                >
                  解決済みにして出題を再開
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-line bg-ink-soft p-4 text-sm text-fg-dim">
        <h2 className="mb-2 font-bold text-fg">このアプリについて</h2>
        <p>収録カード: {ALL_CARDS.length} 枚</p>
        <p>カードデータ生成: {new Date(GENERATED_AT).toLocaleString("ja-JP")}</p>
        <p className="mt-2">
          技術内容の多くはAIによる下書き（未レビュー）です。指導・実践の判断には
          必ず有資格の指導者の確認を経てください。
        </p>
      </section>
    </div>
  );
}
