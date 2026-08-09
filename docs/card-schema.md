# カードスキーマ v1

`content/` 配下のYAMLファイルの構造定義。`npm run validate`（Zod）で機械検証する。

**1ファイル = 1技（またはポジション/概念）**。1ファイルの中に、その技を分解した複数のカードを持つ。
この単位にした理由は、レビュー・出所追跡・差し替えがすべて「技」単位で発生するため。

---

## ファイル全体の構造

```yaml
# ---- 技メタデータ ----
id: closed-guard                 # kebab-case。ファイル名と一致させる。全体で一意
name_ja: クローズドガード
name_en: Closed Guard
aliases: [フルガード, Full Guard]  # 表記ゆれ・別名（解答判定にも使用）
category: positions              # content/ 配下のディレクトリと一致
tags:
  positions: [closed-guard]      # 関連ポジション（多重タグ、§Dの設計）
  concepts: [posture, frame]     # 関連する原理概念

# ---- 出所と検証状態 ----
status: draft                    # draft | reviewed
source_type: ai_research         # ai_research | human_ingest | rulebook
sources:                         # 根拠。source_type により意味が変わる
  - https://example.com/...      #   ai_research → 参照URL
                                 #   human_ingest → ingest/raw/xxx.md#L12-L34
                                 #   rulebook → docs/sources/xxx.pdf §4.2
reviewed_by: null                # 人間のレビュー者。null の間は出題されない
reviewed_date: null
safety_level: none               # none | caution | critical

created: 2026-08-09
updated: 2026-08-09

# ---- カード群 ----
cards:
  - id: closed-guard-def-01      # {技id}-{軸略号}-{連番}
    axis: definition             # 下記「分解軸」参照
    type: free_recall            # 下記「出題形式」参照
    front: 「…」とは何か
    back: |
      …
    note: 補足（任意。出題時には表示せず、レビュー用メモとして使う）
```

---

## 分解軸（`axis`）

`docs/requirements.md` §A の分解軸に対応する。

| 値 | 意味 |
|---|---|
| `definition` | 定義。何をもってそのポジション/技と呼ぶか |
| `requirement` | 成立要件・維持のための必須条件 |
| `grip` | グリップ／コントロールポイント |
| `angle_weight` | 角度・体重配分 |
| `procedure` | 手順（順序を問う） |
| `finish` | 仕上げ・効かせる決め手 |
| `common_mistake` | よくある失敗 |
| `consequence` | 失敗した場合の帰結（`common_mistake` と `causal_pair_id` で対にする） |
| `counter` | 相手の対抗手段 |
| `followup` | 次への連携・派生 |
| `principle` | なぜ効くのか（原理） |
| `hierarchy` | ポジションの優劣・階層関係 |
| `contraindication` | 禁忌（`safety_level: critical` 必須。AI生成禁止） |

---

## 出題形式（`type`）

`docs/requirements.md` §B の対応表に対応する。

| 値 | 採点 | 主な用途 |
|---|---|---|
| `free_recall` | 自己採点 | 原理・コツ・要点。**既定形式** |
| `short_answer` | 自動採点 | 用語名・固有名詞など短答のみ |
| `ordering` | 自動採点 | 手順（1カードあたり最大5項目、§A-2） |
| `true_false` | 自動採点 | 誤解の訂正、禁忌の是非 |
| `multiple_choice` | 自動採点 | ポジション識別など客観的事実に限る |
| `cloze` | 自動採点 | 定義文の核心語の穴埋め |

**`multiple_choice` を「コツ」に使ってはならない**（選択肢から逆算され記憶にならない。`docs/requirements.md` §B）。

---

## 型ごとの追加フィールド

```yaml
# ordering
- id: xxx-proc-01
  axis: procedure
  type: ordering
  front: 次の手順を正しい順に並べよ
  steps:                    # 正しい順で記述する。出題時にシャッフルされる
    - 手順1
    - 手順2
  phase: setup              # setup | execution | finish（10工程を割る際のフェーズ）

# short_answer
- type: short_answer
  answer: 正答
  accept: [許容表記1, 許容表記2]   # エイリアス。§G の表記ゆれ対策

# true_false
- type: true_false
  answer: false
  explanation: なぜ誤りか

# multiple_choice
- type: multiple_choice
  choices: [選択肢A, 選択肢B, 選択肢C, 選択肢D]
  answer_index: 0

# cloze
- type: cloze
  text: ○○は【 】によって成立する
  answer: 正答

# common_mistake ↔ consequence のペア
- id: xxx-mis-01
  axis: common_mistake
  causal_pair_id: xxx-causal-01
- id: xxx-con-01
  axis: consequence
  causal_pair_id: xxx-causal-01
```

---

## 検証ルール（`npm run validate` で機械強制する）

1. `id` は全体で一意。ファイル名（拡張子除く）と技 `id` が一致すること
2. `sources` が空配列のカードはエラー
3. `safety_level: critical` かつ `reviewed_by: null` はエラーではなく**警告**（作成は許すが出題されない）
4. `safety_level: critical` かつ `source_type: ai_research` は**エラー**（`CLAUDE.md` 絶対規則2）
5. `axis: contraindication` は `safety_level: critical` を必須とする
6. `category` が `rules` のカードは `rulebook_version` と条項付き `source` を必須とする（絶対規則3）
7. `type: ordering` の `steps` は2〜5要素
8. `axis: consequence` は対になる `common_mistake` カードが同一 `causal_pair_id` で存在すること
9. `status: reviewed` なのに `reviewed_by` が空はエラー

## 出題プールへの参加条件

以下をすべて満たすカードのみが出題される。1つでも欠ければ出題されない（仕様）。

- `status: reviewed`
- `reviewed_by` が非null
- `stale` フラグが立っていない（上流の一次情報が更新された場合に自動で立つ）
