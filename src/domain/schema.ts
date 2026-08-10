/**
 * カードYAMLのスキーマ定義（docs/card-schema.md の機械可読版）。
 *
 * このファイルが唯一の真実源であり、ビルドスクリプトとアプリの双方が参照する。
 * 検証ルールの番号は docs/card-schema.md「検証ルール」に対応する。
 */
import { z } from "zod";

export const AXES = [
  "definition",
  "requirement",
  "grip",
  "angle_weight",
  "procedure",
  "finish",
  "common_mistake",
  "consequence",
  "counter",
  "followup",
  "principle",
  "hierarchy",
  "contraindication",
] as const;

export const CARD_TYPES = [
  "free_recall",
  "short_answer",
  "ordering",
  "true_false",
  "multiple_choice",
  "cloze",
] as const;

export const SAFETY_LEVELS = ["none", "caution", "critical"] as const;
export const SOURCE_TYPES = ["ai_research", "human_ingest", "rulebook"] as const;
export const STATUSES = ["draft", "reviewed"] as const;

export type Axis = (typeof AXES)[number];
export type CardType = (typeof CARD_TYPES)[number];
export type SafetyLevel = (typeof SAFETY_LEVELS)[number];

const baseCard = {
  id: z.string().min(1),
  axis: z.enum(AXES),
  note: z.string().optional(),
  causal_pair_id: z.string().optional(),
};

/** 自由想起。自己採点。既定形式 */
const freeRecallCard = z.object({
  ...baseCard,
  type: z.literal("free_recall"),
  front: z.string().min(1),
  back: z.string().min(1),
});

/** 短答。自動採点。表記ゆれは accept で吸収する */
const shortAnswerCard = z.object({
  ...baseCard,
  type: z.literal("short_answer"),
  front: z.string().min(1),
  answer: z.string().min(1),
  accept: z.array(z.string()).default([]),
});

/** 手順。検証ルール7: steps は2〜5要素 */
const orderingCard = z.object({
  ...baseCard,
  type: z.literal("ordering"),
  front: z.string().min(1),
  steps: z.array(z.string().min(1)).min(2).max(5),
  phase: z.enum(["setup", "execution", "finish"]),
});

const trueFalseCard = z.object({
  ...baseCard,
  type: z.literal("true_false"),
  front: z.string().min(1),
  answer: z.boolean(),
  explanation: z.string().min(1),
});

// answer_index の範囲検証は techniqueSchema 側で行う。
// discriminatedUnion の要素に .refine() を付けると ZodEffects になり判別子を辿れないため。
const multipleChoiceCard = z.object({
  ...baseCard,
  type: z.literal("multiple_choice"),
  front: z.string().min(1),
  choices: z.array(z.string().min(1)).min(2),
  answer_index: z.number().int().nonnegative(),
});

const clozeCard = z.object({
  ...baseCard,
  type: z.literal("cloze"),
  text: z.string().min(1).includes("【"),
  answer: z.string().min(1),
});

export const cardSchema = z.discriminatedUnion("type", [
  freeRecallCard,
  shortAnswerCard,
  orderingCard,
  trueFalseCard,
  multipleChoiceCard,
  clozeCard,
]);

export type CardInput = z.infer<typeof cardSchema>;

export const techniqueSchema = z
  .object({
    id: z.string().min(1),
    name_ja: z.string().min(1),
    name_en: z.string().min(1),
    aliases: z.array(z.string()).default([]),
    category: z.string().min(1),
    tags: z
      .object({
        positions: z.array(z.string()).default([]),
        concepts: z.array(z.string()).default([]),
      })
      .default({ positions: [], concepts: [] }),

    status: z.enum(STATUSES),
    source_type: z.enum(SOURCE_TYPES),
    // 検証ルール2: sources が空のカードはエラー
    sources: z.array(z.string().min(1)).min(1),
    reviewed_by: z.string().nullable(),
    reviewed_date: z.union([z.string(), z.date()]).nullable(),
    safety_level: z.enum(SAFETY_LEVELS),
    rulebook_version: z.string().optional(),

    created: z.union([z.string(), z.date()]),
    updated: z.union([z.string(), z.date()]),

    cards: z.array(cardSchema).min(1),
  })
  // 検証ルール4: 安全critical を AI が書くのは CLAUDE.md 絶対規則2 違反
  .refine((t) => !(t.safety_level === "critical" && t.source_type === "ai_research"), {
    message: "safety_level:critical のカードは AI が生成してはならない（絶対規則2）",
  })
  // 検証ルール9
  .refine((t) => !(t.status === "reviewed" && !t.reviewed_by), {
    message: "status:reviewed には reviewed_by が必須",
  })
  // 検証ルール6: ルール系は typed 版のバージョン必須（絶対規則3）
  .refine((t) => t.category !== "rules" || Boolean(t.rulebook_version), {
    message: "rules カテゴリには rulebook_version が必須（絶対規則3）",
  })
  // 検証ルール5
  .refine(
    (t) => t.cards.every((c) => c.axis !== "contraindication" || t.safety_level === "critical"),
    { message: "axis:contraindication は safety_level:critical が必須" },
  )
  .refine(
    (t) =>
      t.cards.every(
        (c) => c.type !== "multiple_choice" || c.answer_index < c.choices.length,
      ),
    { message: "multiple_choice の answer_index が choices の範囲外" },
  );

export type TechniqueInput = z.infer<typeof techniqueSchema>;

/** ビルド後にアプリが読む、技メタデータを畳み込んだ出題単位 */
export interface QuizCard {
  id: string;
  techniqueId: string;
  techniqueNameJa: string;
  category: string;
  axis: Axis;
  safetyLevel: SafetyLevel;
  status: (typeof STATUSES)[number];
  reviewedBy: string | null;
  sources: string[];
  tags: { positions: string[]; concepts: string[] };
  /** 解答判定に使う技の別名。short_answer の accept を補完する */
  techniqueAliases: string[];
  payload: CardInput;
}
