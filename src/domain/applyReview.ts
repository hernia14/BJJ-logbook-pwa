/**
 * レビュー判定をカードYAMLへ書き戻す純粋ロジック。
 *
 * YAML全体を再出力（dump）すると、書式が変わって差分が巨大になり、
 * Gitでのレビューという本プロジェクトの前提が機能しなくなる。
 * そのため対象カードのブロックだけを行単位で書き換える。
 */

export interface ApprovalInput {
  cardId: string;
  reviewer: string;
  /** YYYY-MM-DD */
  date: string;
}

export interface ApplyResult {
  lines: string[];
  applied: string[];
  notFound: string[];
}

const CARD_ID_RE = /^(\s*)-\s+id:\s*(\S+)\s*$/;
/** カード内の項目行。カードidの行より1段深いインデントを持つ */
const FIELD_RE = /^(\s*)([A-Za-z_][A-Za-z0-9_]*):/;

/**
 * 1ファイル分の行配列に承認内容を適用する。
 *
 * 各カードの `- id:` 行の直後に status / reviewed_by / reviewed_date を挿入する。
 * 既に同じ項目があれば値を置き換える。
 */
export function applyApprovals(
  lines: readonly string[],
  approvals: readonly ApprovalInput[],
): ApplyResult {
  const byId = new Map(approvals.map((a) => [a.cardId, a]));
  const applied: string[] = [];
  const out: string[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] as string;
    const match = CARD_ID_RE.exec(line);
    const approval = match ? byId.get(match[2] as string) : undefined;

    if (!match || !approval) {
      out.push(line);
      i++;
      continue;
    }

    // カードブロックの範囲を求める。次のカード（同じインデントの "- "）または
    // インデントが浅くなる行の手前まで。
    const dashIndent = (match[1] as string).length;
    const fieldIndent = " ".repeat(dashIndent + 2);
    let end = i + 1;
    while (end < lines.length) {
      const l = lines[end] as string;
      if (l.trim() === "") {
        end++;
        continue;
      }
      const indent = l.length - l.trimStart().length;
      if (indent <= dashIndent) break;
      end++;
    }

    // ブロック内の既存 status / reviewed_by / reviewed_date を除いて詰め直す
    const managed = new Set(["status", "reviewed_by", "reviewed_date"]);
    const body: string[] = [];
    for (let j = i + 1; j < end; j++) {
      const l = lines[j] as string;
      const f = FIELD_RE.exec(l);
      const indent = l.length - l.trimStart().length;
      if (f && indent === fieldIndent.length && managed.has(f[2] as string)) {
        // 既存値は書き換えるので落とす。複数行にまたがる値は想定しない
        continue;
      }
      body.push(l);
    }

    out.push(line);
    out.push(`${fieldIndent}status: reviewed`);
    out.push(`${fieldIndent}reviewed_by: ${approval.reviewer}`);
    out.push(`${fieldIndent}reviewed_date: "${approval.date}"`);
    out.push(...body);

    applied.push(approval.cardId);
    byId.delete(approval.cardId);
    i = end;
  }

  return { lines: out, applied, notFound: [...byId.keys()] };
}

export interface ReviewExport {
  format: "bjj-drill-review";
  version: 1;
  approved: { cardId: string; reviewer: string; decidedAt: number }[];
  needsFix?: { cardId: string; note: string }[];
}

export function validateReviewExport(raw: unknown): { ok: boolean; error?: string } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "JSONオブジェクトではありません" };
  }
  const p = raw as Record<string, unknown>;
  if (p.format !== "bjj-drill-review") {
    return { ok: false, error: "レビュー結果のエクスポートファイルではありません" };
  }
  if (p.version !== 1) {
    return { ok: false, error: `未対応のバージョンです: ${String(p.version)}` };
  }
  if (!Array.isArray(p.approved)) {
    return { ok: false, error: "approved が配列ではありません" };
  }
  for (const row of p.approved as unknown[]) {
    if (typeof row !== "object" || row === null) {
      return { ok: false, error: "approved に不正な要素があります" };
    }
    const r = row as Record<string, unknown>;
    if (typeof r.cardId !== "string" || typeof r.reviewer !== "string" || r.reviewer.trim() === "") {
      return { ok: false, error: "approved の要素に cardId または reviewer がありません" };
    }
  }
  return { ok: true };
}
