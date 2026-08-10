/**
 * アプリでエクスポートしたレビュー判定を content/ のYAMLへ書き戻す。
 *
 *   npm run apply-review -- <エクスポートしたJSONのパス>
 *   npm run apply-review -- <パス> --dry-run    変更内容だけ表示して書き込まない
 *
 * アプリ内の承認はあくまで端末上の下書きであり、
 * ここでYAMLへ反映しGitへコミットして初めて確定する（requirements §H）。
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { applyApprovals, validateReviewExport, type ApprovalInput } from "../src/domain/applyReview.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CONTENT_DIR = join(ROOT, "content");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const inputPath = args.find((a) => !a.startsWith("--"));

if (!inputPath) {
  console.error("使い方: npm run apply-review -- <エクスポートしたJSONのパス> [--dry-run]");
  process.exit(1);
}

let raw: unknown;
try {
  raw = JSON.parse(readFileSync(inputPath, "utf8"));
} catch (e) {
  console.error(`JSONを読み込めません: ${(e as Error).message}`);
  process.exit(1);
}

const check = validateReviewExport(raw);
if (!check.ok) {
  console.error(`ファイル形式が不正です: ${check.error}`);
  process.exit(1);
}

const review = raw as {
  approved: { cardId: string; reviewer: string; decidedAt: number }[];
  needsFix?: { cardId: string; note: string }[];
};

const approvals: ApprovalInput[] = review.approved.map((a) => ({
  cardId: a.cardId,
  reviewer: a.reviewer.trim(),
  date: new Date(a.decidedAt).toISOString().slice(0, 10),
}));

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (extname(e) === ".yaml" || extname(e) === ".yml") out.push(full);
  }
  return out.sort();
}

const files = walk(CONTENT_DIR);

// どのカードがどのファイルにあるかを先に把握する
const fileOfCard = new Map<string, string>();
for (const file of files) {
  const doc = yaml.load(readFileSync(file, "utf8")) as { cards?: { id: string }[] } | null;
  for (const c of doc?.cards ?? []) fileOfCard.set(c.id, file);
}

const unknownCards = approvals.filter((a) => !fileOfCard.has(a.cardId));
if (unknownCards.length > 0) {
  console.error(`content/ に存在しないカードIDが ${unknownCards.length} 件あります:`);
  for (const a of unknownCards.slice(0, 10)) console.error(`  - ${a.cardId}`);
  console.error("カードが削除・リネームされた可能性があります。中止します。");
  process.exit(1);
}

// ファイルごとにまとめて適用する
const byFile = new Map<string, ApprovalInput[]>();
for (const a of approvals) {
  const file = fileOfCard.get(a.cardId) as string;
  const list = byFile.get(file) ?? [];
  list.push(a);
  byFile.set(file, list);
}

let changedFiles = 0;
let appliedCards = 0;

for (const [file, list] of byFile) {
  const original = readFileSync(file, "utf8");
  const eol = original.includes("\r\n") ? "\r\n" : "\n";
  const result = applyApprovals(original.split(/\r?\n/), list);
  const next = result.lines.join(eol);

  appliedCards += result.applied.length;
  if (next === original) continue;

  changedFiles++;
  const rel = relative(ROOT, file).split(sep).join("/");
  console.log(`${dryRun ? "[dry-run] " : ""}${rel}  (${result.applied.length}枚)`);
  if (!dryRun) writeFileSync(file, next, "utf8");
}

console.log(`\n承認 ${appliedCards} 枚 / 変更ファイル ${changedFiles} 件`);

if (review.needsFix && review.needsFix.length > 0) {
  console.log(`\n要修正として報告されたカード ${review.needsFix.length} 件:`);
  for (const n of review.needsFix) {
    console.log(`  - ${n.cardId}${n.note ? `: ${n.note}` : ""}`);
  }
  console.log("  これらは自動修正しません。内容を直してから改めて承認してください。");
}

if (dryRun) {
  console.log("\n--dry-run のため書き込んでいません。");
} else if (changedFiles > 0) {
  console.log("\n次に実行してください:");
  console.log("  npm run validate");
  console.log("  git add content/ && git commit");
}
