/**
 * content/ 配下のカードYAMLを検証し、アプリが読む JSON へ変換する。
 *
 *   npm run build:content   … 検証して src/generated/cards.json を出力
 *   npm run validate        … 検証のみ（--check）。エラーが1件でもあれば終了コード1
 *
 * ビルド時に静的JSONへ落とすことで、実行時のYAMLパースをなくし起動を速くする
 * （docs/requirements.md §I）。
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, relative, basename, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { techniqueSchema, type QuizCard, type TechniqueInput } from "../src/domain/schema.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CONTENT_DIR = join(ROOT, "content");
const OUT_DIR = join(ROOT, "src", "generated");
const OUT_FILE = join(OUT_DIR, "cards.json");

const checkOnly = process.argv.includes("--check");

function walkYaml(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walkYaml(full));
    } else if (extname(entry) === ".yaml" || extname(entry) === ".yml") {
      out.push(full);
    }
  }
  return out.sort();
}

const errors: string[] = [];
const techniques: TechniqueInput[] = [];
const seenTechniqueIds = new Set<string>();
const seenCardIds = new Set<string>();
/** 因果ペアID → 出現した軸 */
const causalPairs = new Map<string, string[]>();

for (const file of walkYaml(CONTENT_DIR)) {
  const rel = relative(ROOT, file).split(sep).join("/");
  const push = (msg: string) => errors.push(`${rel}: ${msg}`);

  let raw: unknown;
  try {
    raw = yaml.load(readFileSync(file, "utf8"));
  } catch (e) {
    push(`YAMLパース失敗: ${(e as Error).message}`);
    continue;
  }

  const parsed = techniqueSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      push(`${issue.path.join(".") || "(root)"}: ${issue.message}`);
    }
    continue;
  }

  const technique = parsed.data;

  // 検証ルール1: id はファイル名と一致し、全体で一意
  const stem = basename(file, extname(file));
  if (technique.id !== stem) {
    push(`id がファイル名と不一致: ${technique.id} != ${stem}`);
  }
  if (seenTechniqueIds.has(technique.id)) {
    push(`技idが重複: ${technique.id}`);
  }
  seenTechniqueIds.add(technique.id);

  for (const card of technique.cards) {
    if (seenCardIds.has(card.id)) {
      push(`カードidが重複: ${card.id}`);
    }
    seenCardIds.add(card.id);
    if (card.causal_pair_id) {
      const axes = causalPairs.get(card.causal_pair_id) ?? [];
      axes.push(card.axis);
      causalPairs.set(card.causal_pair_id, axes);
    }
  }

  techniques.push(technique);
}

// 検証ルール8: 因果ペアは common_mistake と consequence の対で存在すること
for (const [pairId, axes] of causalPairs) {
  const sorted = [...axes].sort();
  if (sorted.length !== 2 || sorted[0] !== "common_mistake" || sorted[1] !== "consequence") {
    errors.push(`因果ペア ${pairId} が不完全: [${axes.join(", ")}]`);
  }
}

const cards: QuizCard[] = techniques.flatMap((t) =>
  t.cards.map((card) => ({
    id: card.id,
    techniqueId: t.id,
    techniqueNameJa: t.name_ja,
    category: t.category,
    axis: card.axis,
    safetyLevel: t.safety_level,
    status: t.status,
    reviewedBy: t.reviewed_by,
    sources: t.sources,
    tags: t.tags,
    techniqueAliases: t.aliases,
    payload: card,
  })),
);

const byCategory: Record<string, number> = {};
const byType: Record<string, number> = {};
const bySafety: Record<string, number> = {};
for (const c of cards) {
  byCategory[c.category] = (byCategory[c.category] ?? 0) + 1;
  byType[c.payload.type] = (byType[c.payload.type] ?? 0) + 1;
  bySafety[c.safetyLevel] = (bySafety[c.safetyLevel] ?? 0) + 1;
}
const reviewedCount = cards.filter((c) => c.status === "reviewed" && c.reviewedBy).length;

console.log(`技 ${techniques.length} / カード ${cards.length}`);
console.log(`カテゴリ別: ${JSON.stringify(byCategory)}`);
console.log(`形式別: ${JSON.stringify(byType)}`);
console.log(`安全度別: ${JSON.stringify(bySafety)}`);
console.log(`出題可能（reviewed）: ${reviewedCount} / ${cards.length}`);

if (errors.length > 0) {
  console.error(`\nエラー ${errors.length}件:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

if (checkOnly) {
  console.log("\n検証OK");
  process.exit(0);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(
  OUT_FILE,
  JSON.stringify({ generatedAt: new Date().toISOString(), cards }, null, 0),
  "utf8",
);
console.log(`\n出力: ${relative(ROOT, OUT_FILE).split(sep).join("/")}`);
