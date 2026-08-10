# BJJ-logbook-pwa

ブラジリアン柔術の技術知識（手順・コツ・よくある失敗・禁忌・IBJJFルール）を
間隔反復（Spaced Repetition）で定着させる、オフライン動作の一問一答アプリ。

出題の9割は「技の方法」であり、競技ルールのクイズはごく一部の補助的位置づけ。
競技ルールは **IBJJF Rule Book v6.0**（2026年版）のみを典拠とする。

## 経緯

本リポジトリ（`hernia14/BJJ-logbook-pwa`）は元々、単一HTML構成の簡易PWA
（`icon/`, `index.html`, `manifest.json`, `sw.js`）として作られたもの。
今回、間隔反復クイズアプリとしてVite + React + TypeScript構成に全面的に作り直すにあたり、
旧ファイル一式は削除せず `legacy/` ディレクトリへ移設し、参考・再利用の可能性のために保持する。

## 0. 触る前に必ず読むこと

- **`content/` を直接手で編集しない。** スキーマ検証(`npm run validate`)を通らないと
  意味のないデータが混入する。カードの追加・修正は必ず生成 → validate → PRの経路を通す。
- **`ingest/raw/` を安易に消さない。** 人間の一次情報はここに置く。
  カードの `sources` がこのファイルを指すため、移動・削除するとカードの出所が壊れる。
- **未レビュー（`status: draft`）のカードは出題されない。** 仕様であり不具合ではない。
  レビューモード（設定 → レビューモードON）でのみ確認できる。
  現時点では **全 521 枚が draft**。
- **`safety_level: critical` のカードはAIが書いてはならない**（`CLAUDE.md` 絶対規則2）。
  スキーマ検証がこれを機械的に弾く。
- **オフライン専用。** バックエンドは存在しない。同期・ログイン機能を後から足す予定もない。
  複数端末で使う場合は「エクスポート → インポート」で手動同期する。

---

## 1. セットアップ

```bash
git clone https://github.com/hernia14/BJJ-logbook-pwa.git
cd BJJ-logbook-pwa
npm install
npm run dev          # http://localhost:5173 が開く
```

Node.js 20 以上（開発は v24 で確認）。

**起動直後はカードが0枚と表示される。これは仕様。**
収録カードは全て未レビュー（`status: draft`）のため、出題プールに入らない。
内容を確認するには 設定 → レビューモード を有効にする。

---

## 2. 日常的に使うコマンド

| コマンド | いつ使うか |
|---|---|
| `npm run dev` | 学習・動作確認 |
| `npm run validate` | `content/` を編集/生成した直後に必ず実行。エラーが1件でも出たらPRを出さない |
| `npm run build:content` | `content/` の YAML を `src/generated/cards.json` へ変換（`dev`/`build` が自動実行する） |
| `npm run stats` | カテゴリ別カード数、未レビュー枚数、出題比率の目標との乖離、`axis` 別分布を確認 |
| `npm test` | `src/domain/` のロジック（判定・SRS・セッション選定・インポート検証）の単体テスト |
| `npm run typecheck` | コミット前 |
| `npm run build` | 本番ビルド（`dist/`） |
| `npm run icons` | PWAアイコンPNGを再生成（図柄を変えたときだけ） |

`npm run validate` と `npm run stats` はほぼ毎回セットで使う。

**未実装（今後追加予定）**

| コマンド | 用途 |
|---|---|
| `npm run find-orphans` | `ingest/raw/` にあるがカード化されていない技術要素を検出（`ingest/raw/` 投入後に実装） |
| `npm run find-outdated` | ルール改訂後に古い `rulebook_version` のカードを列挙（`content/rules/` 着手後に実装） |
| `npm run test:e2e` | Playwright。オフライン動作・エクスポート/インポートの整合性 |
| `npm run lint` | ESLint |

---

## 3. ディレクトリと「どこに何があるか」

```
bjj-drill/
├── ingest/raw/          自分の指導ノート・口述メモ（一次情報、原本）
├── docs/sources/        IBJJF Rule Book v6.0 / Rules Update Guide v6.0（一次資料）
├── content/             生成済みの問題データ（YAML、Gitで管理・レビュー対象）
│   ├── techniques/      技術カード（8割）
│   ├── rules/           IBJJF v6.0 ルールカード
│   ├── safety/          禁忌・怪我予防（要人間レビュー）
│   ├── terminology/     用語
│   └── history/         歴史
├── src/domain/          純関数のみ。テスト対象
│   ├── schema.ts        カードYAMLのZodスキーマ（docs/card-schema.md の機械可読版）
│   ├── srs.ts           SM-2 スケジューラ
│   ├── normalize.ts     日本語の表記ゆれ正規化と解答判定
│   ├── session.ts       出題カードの選定
│   └── importGuard.ts   エクスポートファイルの形式検証
├── src/db/              IndexedDB(Dexie) の保存・エクスポート/インポート
├── src/ui/              画面
├── src/generated/       ビルド生成物（Git管理外）
├── scripts/             build-content / stats / make-icons / validate_content.py
└── docs/                要件定義・設計・運用手順（README には書かない詳細はここ）
```

迷ったらこの順で見る:
「カードの内容がおかしい」→ `content/` の該当YAML → `sources` を辿る
「判定がおかしい」→ `src/domain/normalize.ts` と `tests/normalize.test.ts`
「出題される/されないがおかしい」→ `src/domain/session.ts` の `isEligible`
「なぜこの設計か」→ `docs/requirements.md`

---

## 4. カードを1枚追加/修正するときの最短手順

1. 内容の根拠を確認する。一次情報（`ingest/raw/`・`docs/sources/`）があればそれを使う。
   なければWeb調査に基づくAI下書きを許可する（`CLAUDE.md` 絶対規則1）。
   ただし `safety_level: critical` のカードはAI執筆禁止（絶対規則2）
2. Claude Code に該当ファイルを指定して生成・修正させる
3. `npm run validate` を通す
4. `npm run stats` で比率と未レビュー枚数を確認
5. `content/` の変更のみでコミット（1コミット1論点）
6. 自分でレビューし、`status: reviewed` と `reviewed_by` を埋める。
   これを埋めるまでそのカードは出題されない

カードの分解方針（1技を何枚に割るか等）は `docs/requirements.md` §A、
YAMLの書式は `docs/card-schema.md`。

---

## 5. トラブルシューティング

| 症状 | 原因の見当 |
|---|---|
| カードが0枚と出る | 全カードが `status: draft` のため。仕様。設定 → レビューモードで確認できる |
| 特定のカードが出題されない | `status`/`reviewed_by` が未設定か、アプリ内で誤り報告済み（設定 → 誤り報告から解除できる） |
| `npm run validate` が落ちる | メッセージに検証ルール番号が出る。`docs/card-schema.md`「検証ルール」を参照 |
| `npm run dev` でカードが古い | `content/` 変更後は `build:content` が必要。`npm run dev` が自動実行するので再起動する |
| 学習履歴が消えた | ブラウザのサイトデータ削除、またはシークレットモードで開いた。定期的にエクスポートを取る |
| PWAが更新されない | Service Worker のキャッシュ。一度アンインストールして再インストールする |

---

## 6. デプロイ

未設定。GitHub Pages への自動デプロイを行う場合は `.github/workflows/` にワークフローを追加する。

公開する場合の注意: 現時点で全カードが未レビューのAI下書きであり、
レビューモードを使わない限り出題はされないが、カード内容自体はビルド成果物に含まれる。

---

## 7. ライセンス・利用範囲

個人利用を前提に構築。道場内で他の生徒に配布する場合、
技術内容の一次情報は自分の指導ノートに基づくため、配布範囲は自分の裁量で判断する。
IBJJFルール記載部分の出典は各カードの `source` フィールドに明記されている。

---

## 関連ドキュメント

- 設計思想・要件: `docs/requirements.md`
- カードYAMLの書式と検証ルール: `docs/card-schema.md`
- 収録技の一覧: `docs/technique-taxonomy.md`
- 人間に確認したい未解決事項: `TODO_QUESTIONS.md`
- Claude Code への実装規則: `CLAUDE.md`