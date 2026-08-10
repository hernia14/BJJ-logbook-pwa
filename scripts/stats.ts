/**
 * カード統計を表示する。
 *
 *   npm run stats
 *
 * CLAUDE.md「出題比率の目標」からの乖離を検査し、外れていれば警告する。
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { techniqueSchema, type TechniqueInput } from "../src/domain/schema.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CONTENT_DIR = join(ROOT, "content");

/** 出題比率の目標は content/targets.yaml が真実源（CLAUDE.md「出題比率の目標」） */
interface TargetsFile {
  groups: { label: string; min: number; max: number; categories: string[] }[];
  not_started_yet?: string[];
}

const targets = yaml.load(
  readFileSync(join(CONTENT_DIR, "targets.yaml"), "utf8"),
) as TargetsFile;

/** content/ 直下のYAMLは設定ファイル。サブディレクトリ配下だけを技として扱う */
function walk(dir: string, depth = 0): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) out.push(...walk(full, depth + 1));
    else if (depth > 0 && (extname(e) === ".yaml" || extname(e) === ".yml")) out.push(full);
  }
  return out;
}

const techniques: TechniqueInput[] = [];
for (const file of walk(CONTENT_DIR)) {
  const parsed = techniqueSchema.safeParse(yaml.load(readFileSync(file, "utf8")));
  if (parsed.success) techniques.push(parsed.data);
}

const allCards = techniques.flatMap((t) =>
  t.cards.map((c) => ({
    category: t.category,
    axis: c.axis,
    type: c.type,
    safety: t.safety_level,
    reviewed: t.status === "reviewed" && Boolean(t.reviewed_by),
    sourceType: t.source_type,
  })),
);
const total = allCards.length;

const count = (pred: (c: (typeof allCards)[number]) => boolean) => allCards.filter(pred).length;
const pct = (n: number) => (total === 0 ? 0 : (n / total) * 100);
const bucket = <T extends string>(key: (c: (typeof allCards)[number]) => T) => {
  const m = new Map<T, number>();
  for (const c of allCards) m.set(key(c), (m.get(key(c)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

console.log(`技 ${techniques.length} / カード ${total}\n`);

console.log("■ 出題比率（content/targets.yaml の目標との対比）");
const notStarted = new Set(targets.not_started_yet ?? []);
const warnings: string[] = [];
for (const target of targets.groups) {
  const n = count((c) => target.categories.includes(c.category));
  const p = pct(n);
  const ok = p >= target.min && p <= target.max;
  // 未着手カテゴリが1つでも残っている間、比率の比較は情報を持たない。
  // 他の群が0枚なら残りの群は必ず100%になるため、そこで警告しても意味がない。
  const pending = target.categories.every((c) => notStarted.has(c));
  if (!ok && !pending && notStarted.size === 0) {
    warnings.push(`${target.label}: ${p.toFixed(1)}% （目標 ${target.min}〜${target.max}%）`);
  }
  const mark = ok ? "○" : notStarted.size > 0 ? "－" : "×";
  console.log(
    `  ${mark} ${target.label.padEnd(12)} ${String(n).padStart(4)}枚  ${p.toFixed(1).padStart(5)}%  目標 ${target.min}〜${target.max}%${pending ? "（未着手）" : ""}`,
  );
}

console.log("\n■ カテゴリ別");
for (const [k, v] of bucket((c) => c.category)) {
  console.log(`  ${k.padEnd(16)} ${String(v).padStart(4)}枚  ${pct(v).toFixed(1).padStart(5)}%`);
}

console.log("\n■ 分解軸別");
for (const [k, v] of bucket((c) => c.axis)) {
  console.log(`  ${k.padEnd(16)} ${String(v).padStart(4)}枚`);
}

console.log("\n■ 出題形式別");
for (const [k, v] of bucket((c) => c.type)) {
  console.log(`  ${k.padEnd(16)} ${String(v).padStart(4)}枚`);
}

console.log("\n■ 安全度別");
for (const [k, v] of bucket((c) => c.safety)) {
  console.log(`  ${k.padEnd(16)} ${String(v).padStart(4)}枚`);
}

console.log("\n■ レビュー状況");
const reviewed = count((c) => c.reviewed);
console.log(`  レビュー済み（出題可能） ${reviewed}枚`);
console.log(`  未レビュー（draft）      ${total - reviewed}枚`);
console.log(`  うちAI下書き             ${count((c) => c.sourceType === "ai_research")}枚`);

if (notStarted.size > 0) {
  console.log(
    `\n注: 未着手カテゴリ（${[...notStarted].join(", ")}）があるため比率は暫定値です。`,
  );
  console.log("  着手したら content/targets.yaml の not_started_yet から削除してください。");
}

if (warnings.length > 0) {
  console.log("\n⚠ 目標比率から外れています:");
  for (const w of warnings) console.log(`  - ${w}`);
}
