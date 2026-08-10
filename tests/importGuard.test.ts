import { describe, expect, it } from "vitest";
import { validateExportPayload } from "../src/domain/importGuard";

const valid = {
  format: "bjj-drill-export",
  version: 1,
  exportedAt: "2026-08-10T00:00:00.000Z",
  srs: [{ cardId: "c1", dueAt: 1_700_000_000_000 }],
  reviewLog: [],
};

describe("validateExportPayload", () => {
  it("正しい形式を受け入れる", () => {
    expect(validateExportPayload(valid).ok).toBe(true);
  });

  it("srs が空でも受け入れる", () => {
    expect(validateExportPayload({ ...valid, srs: [] }).ok).toBe(true);
  });

  it("オブジェクト以外を拒否する", () => {
    expect(validateExportPayload(null).ok).toBe(false);
    expect(validateExportPayload("文字列").ok).toBe(false);
    expect(validateExportPayload([]).ok).toBe(false);
  });

  it("他アプリのJSONを拒否する", () => {
    expect(validateExportPayload({ foo: "bar" }).ok).toBe(false);
  });

  it("未対応バージョンを拒否する", () => {
    const r = validateExportPayload({ ...valid, version: 2 });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("バージョン");
  });

  it("srs が配列でなければ拒否する", () => {
    expect(validateExportPayload({ ...valid, srs: {} }).ok).toBe(false);
  });

  it("srs の要素に必須項目がなければ拒否する", () => {
    expect(validateExportPayload({ ...valid, srs: [{ cardId: "c1" }] }).ok).toBe(false);
    expect(validateExportPayload({ ...valid, srs: [{ dueAt: 1 }] }).ok).toBe(false);
    expect(validateExportPayload({ ...valid, srs: [null] }).ok).toBe(false);
  });
});
