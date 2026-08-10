import { describe, expect, it } from "vitest";
import { applyApprovals, validateReviewExport } from "../src/domain/applyReview";

const yaml = `id: mount
name_ja: マウント
status: draft
reviewed_by: null

cards:
  - id: mount-def-01
    axis: definition
    type: free_recall
    front: マウントとは
    back: |
      上から跨る状態。
  - id: mount-req-01
    axis: requirement
    type: free_recall
    front: 維持の要件は
    back: |
      ベースを保つ。
`.split("\n");

describe("applyApprovals", () => {
  it("指定したカードにだけレビュー項目を挿入する", () => {
    const r = applyApprovals(yaml, [
      { cardId: "mount-def-01", reviewer: "hernia14", date: "2026-08-10" },
    ]);
    const text = r.lines.join("\n");

    expect(r.applied).toEqual(["mount-def-01"]);
    expect(text).toContain("  - id: mount-def-01\n    status: reviewed\n    reviewed_by: hernia14\n    reviewed_date: \"2026-08-10\"");
    // もう一方のカードは触らない
    expect(text).toContain("  - id: mount-req-01\n    axis: requirement");
  });

  it("対象外の行を変更しない", () => {
    const r = applyApprovals(yaml, [
      { cardId: "mount-def-01", reviewer: "hernia14", date: "2026-08-10" },
    ]);
    const text = r.lines.join("\n");
    expect(text).toContain("id: mount\nname_ja: マウント\nstatus: draft");
    expect(text).toContain("      上から跨る状態。");
    expect(text).toContain("      ベースを保つ。");
  });

  it("カードの本文（複数行の答え）を保持する", () => {
    const r = applyApprovals(yaml, [
      { cardId: "mount-req-01", reviewer: "hernia14", date: "2026-08-10" },
    ]);
    const text = r.lines.join("\n");
    expect(text).toContain("front: 維持の要件は");
    expect(text).toContain("back: |");
    expect(text).toContain("      ベースを保つ。");
  });

  it("複数カードをまとめて適用できる", () => {
    const r = applyApprovals(yaml, [
      { cardId: "mount-def-01", reviewer: "a", date: "2026-08-10" },
      { cardId: "mount-req-01", reviewer: "b", date: "2026-08-11" },
    ]);
    expect(r.applied.sort()).toEqual(["mount-def-01", "mount-req-01"]);
    const text = r.lines.join("\n");
    expect(text).toContain("reviewed_by: a");
    expect(text).toContain("reviewed_by: b");
  });

  it("再適用しても項目が重複しない（冪等）", () => {
    const once = applyApprovals(yaml, [
      { cardId: "mount-def-01", reviewer: "hernia14", date: "2026-08-10" },
    ]);
    const twice = applyApprovals(once.lines, [
      { cardId: "mount-def-01", reviewer: "hernia14", date: "2026-08-10" },
    ]);
    const text = twice.lines.join("\n");
    expect(text.match(/reviewed_by: hernia14/g)).toHaveLength(1);
    expect(once.lines.join("\n")).toBe(text);
  });

  it("承認者や日付が変われば値を更新する", () => {
    const once = applyApprovals(yaml, [
      { cardId: "mount-def-01", reviewer: "old", date: "2026-01-01" },
    ]);
    const twice = applyApprovals(once.lines, [
      { cardId: "mount-def-01", reviewer: "new", date: "2026-08-10" },
    ]);
    const text = twice.lines.join("\n");
    expect(text).toContain("reviewed_by: new");
    expect(text).not.toContain("reviewed_by: old");
    expect(text).not.toContain("2026-01-01");
  });

  it("ファイル内に存在しないカードIDは notFound に入る", () => {
    const r = applyApprovals(yaml, [
      { cardId: "not-in-this-file", reviewer: "hernia14", date: "2026-08-10" },
    ]);
    expect(r.applied).toEqual([]);
    expect(r.notFound).toEqual(["not-in-this-file"]);
    expect(r.lines.join("\n")).toBe(yaml.join("\n"));
  });

  it("承認が空なら元の内容をそのまま返す", () => {
    const r = applyApprovals(yaml, []);
    expect(r.lines.join("\n")).toBe(yaml.join("\n"));
  });
});

describe("validateReviewExport", () => {
  const valid = {
    format: "bjj-drill-review",
    version: 1,
    approved: [{ cardId: "c1", reviewer: "hernia14", decidedAt: 1 }],
  };

  it("正しい形式を受け入れる", () => {
    expect(validateReviewExport(valid).ok).toBe(true);
  });

  it("他形式のJSONを拒否する", () => {
    expect(validateReviewExport({ format: "bjj-drill-export", version: 1 }).ok).toBe(false);
    expect(validateReviewExport(null).ok).toBe(false);
  });

  it("レビュー者名が空の承認を拒否する", () => {
    const r = validateReviewExport({ ...valid, approved: [{ cardId: "c1", reviewer: "  " }] });
    expect(r.ok).toBe(false);
  });

  it("未対応バージョンを拒否する", () => {
    expect(validateReviewExport({ ...valid, version: 9 }).ok).toBe(false);
  });
});
