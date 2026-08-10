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

/** CLAUDE.md「出題比率の目標」。カテゴリをこの4群に畳んで比率を見る */
const TARGETS: Record<string, { min: number; max: number; categories: string[] }> = {
  技術: {
    min: 88,
    max: 92,
    categories: [
      "positions",
      "concepts",
      "guard-passing",
      "sweeps",
      "chokes",
      "joint-locks",
      "escapes",
      "takedowns",
      "transitions",
    ],
  },
  "安全・禁忌": { min: 3, max: 6, categories: ["safety"] },
  "IBJJFルール": { min: 2, max: 4, categories: ["rules"] },
  "用語・歴史": { min: 2, max: 4, categories: ["terminology", "history"] },
};

function walk(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (extname(e) === ".yaml" || extname(e) === ".yml") out.push(full);
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

console.log("■ 出題比率（CLAUDE.md の目標との対比）");
const warnings: string[] = [];
for (const [label, target] of Object.entries(TARGETS)) {
  const n = count((c) => target.categories.includes(c.category));
  const p = pct(n);
  const ok = p >= target.min && p <= target.max;
  if (!ok) {
    warnings.push(`${label}: ${p.toFixed(1)}% （目標 ${target.min}〜${target.max}%）`);
  }
  console.log(
    `  ${ok ? "○" : "×"} ${label.padEnd(12)} ${String(n).padStart(4)}枚  ${p.toFixed(1).padStart(5)}%  目標 ${target.min}〜${target.max}%`,
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

if (warnings.length > 0) {
  console.log("\n⚠ 目標比率から外れています:");
  for (const w of warnings) console.log(`  - ${w}`);
  console.log(
    "  （safety / rules / terminology / history が未着手のため、現時点では想定内の乖離）",
  );
}
