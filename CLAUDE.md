# CLAUDE.md

## プロジェクト
ブラジリアン柔術の知識定着用 一問一答アプリ（間隔反復）。
**出題の主軸は技術知識** — 技の手順・効かせるコツ・よくある失敗・禁忌・ポジションの要件。
競技ルールは補助的に扱い、**IBJJF Rule Book v6.0 に固定**する。
ローカル完結・オフラインファースト。個人情報を一切扱わない。

## 絶対規則
1. **技術内容（手順・コツ・ディテール・禁忌・カウンター）を自分で考え出すな。**
   一次情報は `ingest/raw/` と `docs/sources/` のみ。
   そこに書かれていないことを1文字も追加しない。
   足りない情報は `TODO_QUESTIONS.md` に「私に聞くべき質問」として積む。
   捏造は本プロジェクトで最も重い障害。
2. **`safety_level: critical`（禁忌・怪我リスク）のカードはAIが内容を書いてはならない。**
   人間の記述を構造化するだけ。`reviewed_by` が空なら出題プールに入れない。
3. **ルール系カードは `rulebook_version: "v6.0"` と `source`（条項）を必須とする。**
   一次情報は `docs/sources/ibjjf-rulebook-v6.0.pdf` と
   `ibjjf-rules-update-guide-v6.0.pdf` のみ。web上の解説記事を典拠にするな。
4. **IBJJF以外のルールセット（ADCC/JJIF等）のカードは作らない。**
   将来拡張のためデータモデル上は `ruleset` フィールドを持つが、値は `IBJJF` 固定。
5. テストを書いてから実装する。判定ロジックとSRSはユニットテスト必須。
6. `dangerouslySetInnerHTML` / `eval` / `new Function` / インラインscript 禁止。
7. 外部通信を伴うコードは事前に理由と送信内容を提示して承認を得る。
8. 依存追加は事前申告。lockfileをコミット。
9. 1コミット1論点。日本語のConventional Commits。

## 出題比率の目標（`content/targets.yaml` で管理、CIで検査）
- 技術（手順・コツ・失敗・カウンター・ポジション要件・原理）: 88〜92%
- 安全・禁忌・解剖: 3〜6%
- IBJJF v6.0 ルール: 2〜4%
- 用語・歴史: 2〜4%
この比率から外れたらCIで警告する。

## 技術スタック（変更は提案して承認を得る）
Vite + React 18 + TypeScript(strict) / Dexie(IndexedDB) / Zod / Vitest + Playwright /
vite-plugin-pwa / Tailwind CSS

## ディレクトリ
- `ingest/` … 人間の生メモ。読み取り専用として扱う。編集するな
- `docs/sources/` … 一次資料。読み取り専用
- `content/` … 生成された問題データ。人間がレビューする真実
- `src/domain/` … SRS・判定ロジック（純関数）
- `src/db/` `src/ui/` `scripts/` `docs/`

## 用語
「カード」= 1問1答の単位。「デッキ」= カード集合。「セッション」= 1回の学習。