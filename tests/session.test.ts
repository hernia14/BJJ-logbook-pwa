import { describe, expect, it } from "vitest";
import { isEligible, selectSession, shuffle } from "../src/domain/session";
import { initialState, review, type SrsState } from "../src/domain/srs";
import type { QuizCard } from "../src/domain/schema";

const NOW = Date.UTC(2026, 7, 10);
const DAY = 24 * 60 * 60 * 1000;

function makeCard(
  id: string,
  techniqueId: string,
  overrides: Partial<QuizCard> = {},
): QuizCard {
  return {
    id,
    techniqueId,
    techniqueNameJa: techniqueId,
    category: "positions",
    axis: "definition",
    safetyLevel: "none",
    status: "draft",
    reviewedBy: null,
    sources: ["https://example.com"],
    tags: { positions: [], concepts: [] },
    techniqueAliases: [],
    payload: { id, axis: "definition", type: "free_recall", front: "Q", back: "A" },
    ...overrides,
  };
}

describe("isEligible: 出題プールへの参加条件", () => {
  it("draft カードは通常モードでは出題されない", () => {
    const card = makeCard("c1", "t1");
    expect(isEligible(card, false)).toBe(false);
  });

  it("draft カードもレビューモードでは出題される", () => {
    const card = makeCard("c1", "t1");
    expect(isEligible(card, true)).toBe(true);
  });

  it("reviewed でも reviewed_by が空なら出題されない", () => {
    const card = makeCard("c1", "t1", { status: "reviewed", reviewedBy: null });
    expect(isEligible(card, false)).toBe(false);
  });

  it("reviewed かつ reviewed_by があれば出題される", () => {
    const card = makeCard("c1", "t1", { status: "reviewed", reviewedBy: "hernia14" });
    expect(isEligible(card, false)).toBe(true);
  });
});

describe("selectSession", () => {
  const opts = { limit: 20, includeDrafts: true, now: NOW };

  it("候補が潤沢なら同一技の出題を上限までに抑える（requirements §A-6）", () => {
    // 5技×4枚=20枚あり、limit 6 なら上限3を守っても枠が埋まる
    const cards = Array.from({ length: 5 }, (_, t) =>
      Array.from({ length: 4 }, (_, i) => makeCard(`t${t}-c${i}`, `t${t}`)),
    ).flat();
    const selected = selectSession(cards, new Map(), { ...opts, limit: 6, maxPerTechnique: 3 });

    const counts = new Map<string, number>();
    for (const c of selected) counts.set(c.techniqueId, (counts.get(c.techniqueId) ?? 0) + 1);
    expect(selected).toHaveLength(6);
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(3);
  });

  it("1技しか選ばれていなければ上限を超えて補充する", () => {
    // 利用者が1つの技だけを集中反復したい場合、上限で取りこぼしてはならない
    const cards = Array.from({ length: 10 }, (_, i) => makeCard(`c${i}`, "same-technique"));
    const selected = selectSession(cards, new Map(), { ...opts, limit: 8, maxPerTechnique: 3 });
    expect(selected).toHaveLength(8);
  });

  it("補充してもカードが足りなければある分だけ返す", () => {
    const cards = Array.from({ length: 5 }, (_, i) => makeCard(`c${i}`, "same-technique"));
    const selected = selectSession(cards, new Map(), { ...opts, limit: 20, maxPerTechnique: 3 });
    expect(selected).toHaveLength(5);
  });

  it("補充分もカードを重複させない", () => {
    const cards = Array.from({ length: 10 }, (_, i) => makeCard(`c${i}`, "same-technique"));
    const selected = selectSession(cards, new Map(), { ...opts, limit: 10, maxPerTechnique: 3 });
    expect(new Set(selected.map((c) => c.id)).size).toBe(selected.length);
  });

  it("上限を守った分を先に出し、補充分は後ろに回す", () => {
    // 先頭3枚は上限内、残りが補充分。順序が入れ替わらないこと
    const cards = Array.from({ length: 6 }, (_, i) => makeCard(`c${i}`, "same-technique"));
    const selected = selectSession(cards, new Map(), { ...opts, limit: 6, maxPerTechnique: 3 });
    expect(selected.map((c) => c.id)).toEqual(["c0", "c1", "c2", "c3", "c4", "c5"]);
  });

  it("技が分かれていれば全て出題される", () => {
    const cards = Array.from({ length: 10 }, (_, i) => makeCard(`c${i}`, `t${i}`));
    const selected = selectSession(cards, new Map(), { ...opts, maxPerTechnique: 3 });
    expect(selected).toHaveLength(10);
  });

  it("limit 枚で打ち切る", () => {
    const cards = Array.from({ length: 50 }, (_, i) => makeCard(`c${i}`, `t${i}`));
    const selected = selectSession(cards, new Map(), { ...opts, limit: 5 });
    expect(selected).toHaveLength(5);
  });

  it("期限前のカードは出題しない", () => {
    const cards = [makeCard("c1", "t1")];
    const states = new Map<string, SrsState>([
      ["c1", review(initialState(NOW), 5, "none", NOW)],
    ]);
    expect(selectSession(cards, states, opts)).toHaveLength(0);
  });

  it("期限到来済みのカードは出題する", () => {
    const cards = [makeCard("c1", "t1")];
    const state = review(initialState(NOW), 5, "none", NOW);
    const states = new Map<string, SrsState>([["c1", state]]);
    const selected = selectSession(cards, states, { ...opts, now: state.dueAt });
    expect(selected).toHaveLength(1);
  });

  it("期限超過が長いカードを未学習カードより先に出す", () => {
    const cards = [makeCard("overdue", "t1"), makeCard("unseen", "t2")];
    const states = new Map<string, SrsState>([
      ["overdue", { ...initialState(NOW), dueAt: NOW - 30 * DAY, lastReviewedAt: NOW - 60 * DAY }],
    ]);
    const selected = selectSession(cards, states, opts);
    expect(selected[0]?.id).toBe("overdue");
  });

  it("通常モードでは draft を1枚も出さない", () => {
    const cards = Array.from({ length: 10 }, (_, i) => makeCard(`c${i}`, `t${i}`));
    expect(selectSession(cards, new Map(), { ...opts, includeDrafts: false })).toHaveLength(0);
  });
});

describe("shuffle", () => {
  it("同じ seed なら同じ並びを返す", () => {
    const items = [1, 2, 3, 4, 5];
    expect(shuffle(items, 42)).toEqual(shuffle(items, 42));
  });

  it("元の配列を破壊しない", () => {
    const items = [1, 2, 3, 4, 5];
    shuffle(items, 42);
    expect(items).toEqual([1, 2, 3, 4, 5]);
  });

  it("要素を欠落・重複させない", () => {
    const items = [1, 2, 3, 4, 5];
    expect([...shuffle(items, 7)].sort()).toEqual(items);
  });
});
