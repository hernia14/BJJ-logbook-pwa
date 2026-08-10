/**
 * 日本語の表記ゆれ正規化と解答判定（docs/requirements.md §G）。
 *
 * 設計方針:
 * - 自動採点は用語名・数値などの短答に限定する。文章の自動判定はしない
 * - 部分一致は使わない。上位概念が下位概念の解答として誤って通るため
 * - 編集距離は短い語のタイプミス救済にのみ使い、閾値は語長に応じて絞る
 */

/**
 * 表記ゆれを吸収した比較用の文字列に変換する。
 *
 * - NFKC 正規化（全角英数→半角、半角カナ→全角カナ）
 * - カタカナ→ひらがな
 * - 長音・ハイフン類の統一
 * - 中黒・空白の除去
 * - 英字の小文字化
 */
export function normalize(input: string): string {
  return (
    input
      .normalize("NFKC")
      .toLowerCase()
      // カタカナをひらがなへ寄せる（ヴを除く基本領域）
      .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
      // 長音記号とハイフン類を1種類に統一
      .replace(/[ー‐-―−－-]/g, "ー")
      // 中黒・読点類・空白を除去
      .replace(/[・･、,]/g, "")
      .replace(/\s+/g, "")
      .trim()
  );
}

/** レーベンシュタイン距離 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        (curr[j - 1] ?? 0) + 1,
        (prev[j] ?? 0) + 1,
        (prev[j - 1] ?? 0) + cost,
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length] ?? 0;
}

/** CJK統合漢字を含むか */
export function containsKanji(text: string): boolean {
  return /[一-鿿㐀-䶿]/.test(text);
}

/**
 * 語長に応じた編集距離の許容値。
 *
 * 漢字を含む語は常に0（完全一致のみ）とする。
 * 漢字は1文字が意味を担うため、1文字違いは打ち間違いではなく別語である可能性が高い。
 * 実例: 「大外刈り」と「大内刈り」は編集距離1だが全く別の技であり、
 * これを正解として通すと誤った知識を定着させることになる。
 *
 * 仮名・英字のみの語は表音的で打ち間違いが起きやすいため、
 * 語長に応じて救済する。ただし短い語は別語の可能性が上がるため厳しくする。
 */
export function allowedDistance(normalizedAnswer: string): number {
  if (containsKanji(normalizedAnswer)) return 0;
  const n = normalizedAnswer.length;
  if (n <= 5) return 0;
  if (n <= 11) return 1;
  return 2;
}

export interface JudgeResult {
  correct: boolean;
  /** 完全一致か、タイプミス救済による正解か */
  matchedBy: "exact" | "fuzzy" | "none";
  /** 一致した許容表記（デバッグ・レビュー用） */
  matchedAgainst?: string;
}

/**
 * 短答の自動採点。
 * 正答と許容表記のいずれかに、正規化後の完全一致または近傍一致すれば正解とする。
 */
export function judgeShortAnswer(
  userInput: string,
  answer: string,
  accept: readonly string[] = [],
): JudgeResult {
  const normalizedInput = normalize(userInput);
  if (normalizedInput.length === 0) return { correct: false, matchedBy: "none" };

  const candidates = [answer, ...accept];

  for (const candidate of candidates) {
    if (normalize(candidate) === normalizedInput) {
      return { correct: true, matchedBy: "exact", matchedAgainst: candidate };
    }
  }

  for (const candidate of candidates) {
    const normalizedCandidate = normalize(candidate);
    const limit = allowedDistance(normalizedCandidate);
    if (limit > 0 && levenshtein(normalizedInput, normalizedCandidate) <= limit) {
      return { correct: true, matchedBy: "fuzzy", matchedAgainst: candidate };
    }
  }

  return { correct: false, matchedBy: "none" };
}

/** 並べ替えの採点。順序が完全に一致した場合のみ正解 */
export function judgeOrdering(userOrder: readonly number[], stepCount: number): boolean {
  if (userOrder.length !== stepCount) return false;
  return userOrder.every((v, i) => v === i);
}
