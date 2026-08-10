import { describe, expect, it } from "vitest";
import {
  allowedDistance,
  containsKanji,
  judgeOrdering,
  judgeShortAnswer,
  levenshtein,
  normalize,
} from "../src/domain/normalize";

describe("normalize", () => {
  it("カタカナとひらがなを同一視する", () => {
    expect(normalize("キムラ")).toBe(normalize("きむら"));
  });

  it("全角英数を半角に寄せる", () => {
    expect(normalize("ＢＪＪ")).toBe(normalize("bjj"));
  });

  it("英字の大文字小文字を無視する", () => {
    expect(normalize("Kimura")).toBe(normalize("KIMURA"));
  });

  it("中黒の有無を無視する", () => {
    expect(normalize("デラ・ヒーバ")).toBe(normalize("デラヒーバ"));
  });

  it("空白の有無と種類を無視する", () => {
    expect(normalize("ニー スライス")).toBe(normalize("ニースライス"));
    expect(normalize("ニー　スライス")).toBe(normalize("ニースライス"));
  });

  it("長音とハイフン類を統一する", () => {
    expect(normalize("オモプラータ")).toBe(normalize("オモプラ-タ"));
    expect(normalize("ボウアンドアロー")).toBe(normalize("ボウアンドアロ―"));
  });

  it("半角カナを全角カナ相当に正規化する", () => {
    expect(normalize("ｷﾑﾗ")).toBe(normalize("キムラ"));
  });
});

describe("levenshtein", () => {
  it("同一文字列は0", () => {
    expect(levenshtein("abc", "abc")).toBe(0);
  });

  it("1文字置換は1", () => {
    expect(levenshtein("abc", "abd")).toBe(1);
  });

  it("空文字列は相手の長さ", () => {
    expect(levenshtein("", "abcd")).toBe(4);
    expect(levenshtein("abcd", "")).toBe(4);
  });

  it("対称である", () => {
    expect(levenshtein("きむら", "きむらろっく")).toBe(levenshtein("きむらろっく", "きむら"));
  });
});

describe("allowedDistance", () => {
  it("短い語ではタイプミス救済をしない", () => {
    // 5文字以下は1文字違いが別語である可能性が高い
    expect(allowedDistance("えび")).toBe(0);
    expect(allowedDistance("きむら")).toBe(0);
  });

  it("中程度の語は1文字まで許容する", () => {
    expect(allowedDistance("おもぷらーた")).toBe(1);
  });

  it("長い語は2文字まで許容する", () => {
    expect(allowedDistance("ぼうあんどあろーちょーく")).toBe(2);
  });

  it("漢字を含む語は語長によらず完全一致のみとする", () => {
    // 漢字は1文字が意味を担うため、1文字違いは打ち間違いではなく別語
    expect(allowedDistance("大外刈り")).toBe(0);
    expect(allowedDistance("腕十字固め")).toBe(0);
    expect(allowedDistance("裸絞め")).toBe(0);
  });
});

describe("containsKanji", () => {
  it("漢字を検出する", () => {
    expect(containsKanji("大外刈り")).toBe(true);
    expect(containsKanji("袖車")).toBe(true);
  });

  it("仮名・英字のみでは検出しない", () => {
    expect(containsKanji("きむら")).toBe(false);
    expect(containsKanji("オモプラータ")).toBe(false);
    expect(containsKanji("kimura")).toBe(false);
  });
});

describe("judgeShortAnswer", () => {
  it("完全一致を正解とする", () => {
    const r = judgeShortAnswer("キムラ", "キムラ");
    expect(r.correct).toBe(true);
    expect(r.matchedBy).toBe("exact");
  });

  it("表記ゆれを吸収して正解とする", () => {
    expect(judgeShortAnswer("きむら", "キムラ").correct).toBe(true);
    expect(judgeShortAnswer("デラ・ヒーバ", "デラヒーバ").correct).toBe(true);
  });

  it("accept に登録した別名を正解とする", () => {
    const r = judgeShortAnswer("袖車", "エゼキエル絞め", ["袖車", "袖車絞め"]);
    expect(r.correct).toBe(true);
    expect(r.matchedAgainst).toBe("袖車");
  });

  it("長い語のタイプミスを救済する", () => {
    const r = judgeShortAnswer("おもぷらーだ", "オモプラータ");
    expect(r.correct).toBe(true);
    expect(r.matchedBy).toBe("fuzzy");
  });

  it("短い語の1文字違いは不正解にする", () => {
    // 「えび」と「かび」のような別語を通さない
    expect(judgeShortAnswer("かび", "えび").correct).toBe(false);
  });

  it("部分一致では正解にしない", () => {
    // 「ガード」は「クローズドガード」の解答として通ってはならない
    expect(judgeShortAnswer("ガード", "クローズドガード").correct).toBe(false);
    // 逆方向も通してはならない
    expect(judgeShortAnswer("クローズドガード", "ガード").correct).toBe(false);
  });

  it("空入力は不正解", () => {
    expect(judgeShortAnswer("", "キムラ").correct).toBe(false);
    expect(judgeShortAnswer("   ", "キムラ").correct).toBe(false);
  });

  it("別技の名前を正解にしない", () => {
    expect(judgeShortAnswer("アメリカーナ", "キムラ").correct).toBe(false);
    expect(judgeShortAnswer("大内刈り", "大外刈り").correct).toBe(false);
  });
});

describe("judgeOrdering", () => {
  it("正しい順序のみ正解", () => {
    expect(judgeOrdering([0, 1, 2], 3)).toBe(true);
    expect(judgeOrdering([0, 2, 1], 3)).toBe(false);
  });

  it("要素数が違えば不正解", () => {
    expect(judgeOrdering([0, 1], 3)).toBe(false);
  });
});
