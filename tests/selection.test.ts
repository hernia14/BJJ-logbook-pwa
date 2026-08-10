import { describe, expect, it } from "vitest";
import {
  EMPTY_SELECTION,
  buildTree,
  filterSelected,
  groupState,
  isSelected,
  setSelected,
} from "../src/domain/selection";
import type { QuizCard } from "../src/domain/schema";

function makeCard(id: string, techniqueId: string, category = "positions"): QuizCard {
  return {
    id,
    techniqueId,
    techniqueNameJa: techniqueId,
    category,
    axis: "definition",
    safetyLevel: "none",
    status: "draft",
    reviewedBy: null,
    sources: ["https://example.com"],
    tags: { positions: [], concepts: [] },
    techniqueAliases: [],
    payload: { id, axis: "definition", type: "free_recall", front: "Q", back: "A" },
  };
}

describe("既定は全選択", () => {
  it("除外リストが空なら全て選択されている", () => {
    expect(isSelected(EMPTY_SELECTION, "any-card")).toBe(true);
  });

  it("未知のカードIDも既定で選択扱いになる（後から追加したカードが出題される）", () => {
    const sel = setSelected(EMPTY_SELECTION, ["c1"], false);
    expect(isSelected(sel, "c1")).toBe(false);
    // content/ に後から足したカード
    expect(isSelected(sel, "brand-new-card")).toBe(true);
  });
});

describe("setSelected", () => {
  it("解除したカードだけが除外される", () => {
    const sel = setSelected(EMPTY_SELECTION, ["c1", "c2"], false);
    expect(isSelected(sel, "c1")).toBe(false);
    expect(isSelected(sel, "c2")).toBe(false);
    expect(isSelected(sel, "c3")).toBe(true);
  });

  it("再選択すると除外が取り消される", () => {
    let sel = setSelected(EMPTY_SELECTION, ["c1", "c2"], false);
    sel = setSelected(sel, ["c1"], true);
    expect(isSelected(sel, "c1")).toBe(true);
    expect(isSelected(sel, "c2")).toBe(false);
  });

  it("同じカードを二重に解除しても除外は重複しない", () => {
    let sel = setSelected(EMPTY_SELECTION, ["c1"], false);
    sel = setSelected(sel, ["c1"], false);
    expect(sel.excludedCardIds).toEqual(["c1"]);
  });

  it("元の選択を破壊しない", () => {
    const original = setSelected(EMPTY_SELECTION, ["c1"], false);
    setSelected(original, ["c2"], false);
    expect(original.excludedCardIds).toEqual(["c1"]);
  });
});

describe("groupState", () => {
  const ids = ["c1", "c2", "c3"];

  it("全て選択なら all", () => {
    expect(groupState(EMPTY_SELECTION, ids)).toBe("all");
  });

  it("一部だけ解除なら partial", () => {
    expect(groupState(setSelected(EMPTY_SELECTION, ["c2"], false), ids)).toBe("partial");
  });

  it("全て解除なら none", () => {
    expect(groupState(setSelected(EMPTY_SELECTION, ids, false), ids)).toBe("none");
  });

  it("空集合は none", () => {
    expect(groupState(EMPTY_SELECTION, [])).toBe("none");
  });
});

describe("filterSelected", () => {
  it("選択されたカードのみ返す", () => {
    const cards = [makeCard("c1", "t1"), makeCard("c2", "t1"), makeCard("c3", "t2")];
    const sel = setSelected(EMPTY_SELECTION, ["c2"], false);
    expect(filterSelected(sel, cards).map((c) => c.id)).toEqual(["c1", "c3"]);
  });

  it("全解除なら空配列", () => {
    const cards = [makeCard("c1", "t1")];
    const sel = setSelected(EMPTY_SELECTION, ["c1"], false);
    expect(filterSelected(sel, cards)).toEqual([]);
  });
});

describe("buildTree", () => {
  const cards = [
    makeCard("a1", "mount", "positions"),
    makeCard("a2", "mount", "positions"),
    makeCard("b1", "closed-guard", "positions"),
    makeCard("c1", "armbar", "joint-locks"),
  ];

  it("カテゴリ単位にまとめる", () => {
    const tree = buildTree(cards);
    expect(tree.map((c) => c.category)).toEqual(["positions", "joint-locks"]);
  });

  it("カテゴリ配下を技単位にまとめる", () => {
    const positions = buildTree(cards)[0];
    expect(positions?.techniques.map((t) => t.techniqueId)).toEqual(["mount", "closed-guard"]);
    expect(positions?.techniques[0]?.cards.map((c) => c.id)).toEqual(["a1", "a2"]);
  });

  it("カテゴリのカード一覧は配下の技のカードを全て含む", () => {
    const positions = buildTree(cards)[0];
    expect(positions?.cards.map((c) => c.id)).toEqual(["a1", "a2", "b1"]);
  });

  it("カードを欠落・重複させない", () => {
    const total = buildTree(cards).flatMap((c) => c.cards).length;
    expect(total).toBe(cards.length);
  });
});
