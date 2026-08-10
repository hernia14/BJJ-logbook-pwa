import type { SafetyLevel } from "../domain/schema";

/**
 * 安全度の表示（docs/requirements.md §F-3）。
 * 色覚多様性に配慮し、色だけでなくアイコンと文字を併用する。
 */
export function SafetyBadge({ level }: { level: SafetyLevel }) {
  if (level === "none") return null;

  const isCritical = level === "critical";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-bold ${
        isCritical
          ? "bg-critical/20 text-critical ring-1 ring-critical"
          : "bg-caution/20 text-caution ring-1 ring-caution"
      }`}
      role="note"
    >
      <span aria-hidden="true">{isCritical ? "⛔" : "⚠"}</span>
      {isCritical ? "安全上きわめて重要" : "安全上の注意あり"}
    </span>
  );
}

export function DraftBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded bg-fg-dim/20 px-2 py-0.5 text-xs font-bold text-fg-dim ring-1 ring-fg-dim"
      role="note"
    >
      <span aria-hidden="true">✎</span>
      未レビュー（下書き）
    </span>
  );
}
