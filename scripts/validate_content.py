#!/usr/bin/env python3
"""content/ 配下のカードYAMLを検証する暫定スクリプト。

本番の `npm run validate`（Zod）が実装されるまでの繋ぎ。
docs/card-schema.md の検証ルールのうち、現時点で必要なものを実装している。

使い方:
    python scripts/validate_content.py
"""
import collections
import glob
import os
import sys

try:
    import yaml
except ImportError:
    sys.exit("pyyaml が必要です: pip install pyyaml")

# Windowsの既定コンソールエンコーディングだと日本語が文字化けするため明示する
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

VALID_AXES = {
    "definition", "requirement", "grip", "angle_weight", "procedure", "finish",
    "common_mistake", "consequence", "counter", "followup", "principle",
    "hierarchy", "contraindication",
}
VALID_TYPES = {
    "free_recall", "short_answer", "ordering", "true_false",
    "multiple_choice", "cloze",
}
VALID_SAFETY = {"none", "caution", "critical"}


def main() -> int:
    errors = []
    cards = 0
    file_ids, card_ids = set(), set()
    pairs = collections.defaultdict(list)
    by_category = collections.Counter()
    by_type = collections.Counter()

    for path in sorted(glob.glob("content/**/*.yaml", recursive=True)):
        def err(msg):
            errors.append(f"{path}: {msg}")

        try:
            doc = yaml.safe_load(open(path, encoding="utf-8"))
        except yaml.YAMLError as e:
            err(f"YAMLパース失敗: {e}")
            continue

        stem = os.path.splitext(os.path.basename(path))[0]
        if doc.get("id") != stem:
            err(f"id がファイル名と不一致: {doc.get('id')} != {stem}")
        if doc.get("id") in file_ids:
            err(f"id が重複: {doc.get('id')}")
        file_ids.add(doc.get("id"))

        if not doc.get("sources"):
            err("sources が空（検証ルール2）")
        if doc.get("safety_level") not in VALID_SAFETY:
            err(f"不正な safety_level: {doc.get('safety_level')}")
        # 検証ルール4: 安全critical かつ AI生成 は CLAUDE.md 絶対規則2 違反
        if doc.get("safety_level") == "critical" and doc.get("source_type") == "ai_research":
            err("safety_level:critical のカードをAIが生成している（絶対規則2違反）")
        # 検証ルール9
        if doc.get("status") == "reviewed" and not doc.get("reviewed_by"):
            err("status:reviewed だが reviewed_by が空（検証ルール9）")
        # 検証ルール6
        if doc.get("category") == "rules" and not doc.get("rulebook_version"):
            err("rules カテゴリだが rulebook_version がない（絶対規則3）")

        by_category[doc.get("category")] += len(doc.get("cards") or [])

        for card in doc.get("cards") or []:
            cards += 1
            cid = card.get("id", "?")
            by_type[card.get("type")] += 1

            if cid in card_ids:
                err(f"カードid重複: {cid}")
            card_ids.add(cid)
            if card.get("axis") not in VALID_AXES:
                err(f"{cid}: 不正な axis: {card.get('axis')}")
            if card.get("type") not in VALID_TYPES:
                err(f"{cid}: 不正な type: {card.get('type')}")
            # 検証ルール5
            if card.get("axis") == "contraindication" and doc.get("safety_level") != "critical":
                err(f"{cid}: contraindication は safety_level:critical が必須（検証ルール5）")
            # 検証ルール7
            if card.get("type") == "ordering":
                steps = card.get("steps") or []
                if not 2 <= len(steps) <= 5:
                    err(f"{cid}: ordering の steps は2〜5要素（現在{len(steps)}、検証ルール7）")
                if card.get("phase") not in ("setup", "execution", "finish"):
                    err(f"{cid}: ordering の phase が不正: {card.get('phase')}")
            elif not (card.get("front") and card.get("back")):
                err(f"{cid}: front または back が空")

            if card.get("causal_pair_id"):
                pairs[card["causal_pair_id"]].append(card.get("axis"))

    # 検証ルール8
    for pair_id, axes in pairs.items():
        if sorted(axes) != ["common_mistake", "consequence"]:
            errors.append(f"因果ペア {pair_id} が不完全: {axes}（検証ルール8）")

    print(f"ファイル {len(file_ids)} / カード {cards}")
    print(f"カテゴリ別: {dict(by_category)}")
    print(f"形式別: {dict(by_type)}")
    print(f"因果ペア: {len(pairs)}組")

    if errors:
        print(f"\nエラー {len(errors)}件:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("\n検証OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
