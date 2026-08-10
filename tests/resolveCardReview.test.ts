import { describe, expect, it } from "vitest";
import { resolveCardReview } from "../src/domain/schema";

const draftTechnique = {
  status: "draft" as const,
  reviewed_by: null,
  reviewed_date: null,
};

const reviewedTechnique = {
  status: "reviewed" as const,
  reviewed_by: "hernia14",
  reviewed_date: "2026-08-10",
};

describe("resolveCardReview", () => {
  it("カードに指定がなければ技の値を継承する", () => {
    expect(resolveCardReview(draftTechnique, {})).toEqual({
      status: "draft",
      reviewedBy: null,
      reviewedDate: null,
    });
    expect(resolveCardReview(reviewedTechnique, {})).toEqual({
      status: "reviewed",
      reviewedBy: "hernia14",
      reviewedDate: "2026-08-10",
    });
  });

  it("カード単位で承認できる（技はdraftのまま）", () => {
    const resolved = resolveCardReview(draftTechnique, {
      status: "reviewed",
      reviewed_by: "hernia14",
      reviewed_date: "2026-08-10",
    });
    expect(resolved).toEqual({
      status: "reviewed",
      reviewedBy: "hernia14",
      reviewedDate: "2026-08-10",
    });
  });

  it("技が承認済みでもカード単位でdraftへ差し戻せる", () => {
    const resolved = resolveCardReview(reviewedTechnique, {
      status: "draft",
      reviewed_by: null,
    });
    expect(resolved.status).toBe("draft");
    expect(resolved.reviewedBy).toBeNull();
  });

  it("reviewed_by の null（明示的な未レビュー）と未指定を区別する", () => {
    // 明示的な null は継承せず null のまま
    expect(resolveCardReview(reviewedTechnique, { reviewed_by: null }).reviewedBy).toBeNull();
    // 未指定なら技の値を継承する
    expect(resolveCardReview(reviewedTechnique, {}).reviewedBy).toBe("hernia14");
  });

  it("Date 型の日付を YYYY-MM-DD へ正規化する", () => {
    const resolved = resolveCardReview(draftTechnique, {
      status: "reviewed",
      reviewed_by: "hernia14",
      reviewed_date: new Date("2026-08-10T12:34:56.000Z"),
    });
    expect(resolved.reviewedDate).toBe("2026-08-10");
  });

  it("status だけ reviewed にしても reviewed_by がなければ出題条件を満たさない", () => {
    // 出題可否の判定は session.isEligible が行うが、
    // ここでは解決結果として reviewedBy が null のままであることを保証する
    const resolved = resolveCardReview(draftTechnique, { status: "reviewed" });
    expect(resolved.status).toBe("reviewed");
    expect(resolved.reviewedBy).toBeNull();
  });
});
