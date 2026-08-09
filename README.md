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
- **`ingest/raw/` を安易に消さない。** ここが全カードの一次情報。
  YAML化された後でも、`provenance.ref` がこのファイルの行番号を指しているため、
  ファイルを移動・削除するとカードの出所が壊れる。
- **`safety_level: critical` のカードは `reviewed_by` が空だと出題されない。** 仕様であり不具合ではない。
  レビューモード（設定 → レビューモードON）でのみ確認できる。
- **オフライン専用。** バックエンドは存在しない。同期・ログイン機能を後から足す予定もない。
  複数端末で使う場合は「エクスポート → インポート」で手動同期する。

---

## 1. セットアップ

\`\`\`bash
git clone https://github.com/hernia14/BJJ-logbook-pwa.git
cd BJJ-logbook-pwa
npm install
npm run dev          # http://localhost:5173 が開く
\`\`\`

Node.js は `.nvmrc` のバージョンを使うこと（`nvm use`）。

初回起動時、IndexedDB が空の場合はカードが0件と出る。
`content/` にカードが入っているか `npm run stats` で確認する（下記）。

---

## 2. 日常的に使うコマンド

| コマンド | いつ使うか |
|---|---|
| `npm run dev` | 学習・動作確認 |
| `npm run validate` | `content/` を編集/生成した直後に必ず実行。エラーが1件でも出たらPRを出さない |
| `npm run stats` | カテゴリ別カード数、`verified: false` の残数、技術/ルール/安全の比率、`axis` 別分布を確認 |
| `npm run find-orphans` | `ingest/raw/` に書いてあるがカード化されていない技術要素を検出 |
| `npm run find-outdated` | IBJJFルールブックが改訂された後、古い `rulebook_version` を参照するカードを列挙 |
| `npm test` | `src/domain/` のロジック（判定・SRS）の単体テスト |
| `npm run test:e2e` | Playwright。オフライン動作・エクスポート/インポートの整合性を確認 |
| `npm run build` | 本番ビルド（`dist/`） |
| `npm run lint` / `npm run typecheck` | コミット前 |

`npm run validate` と `npm run stats` はほぼ毎回セットで使う。
比率が目標（`content/targets.yaml`）から外れている場合、原因はだいたい
「ルールカードを作りすぎた」か「1技あたりのカード数が偏った」かのどちらか。

---

## 3. ディレクトリと「どこに何があるか」

\`\`\`
bjj-drill/
├── ingest/raw/          自分の指導ノート・口述メモ（一次情報、原本）
├── docs/sources/        IBJJF Rule Book v6.0 / Rules Update Guide v6.0（一次資料）
├── content/             生成済みの問題データ（YAML、Gitで管理・レビュー対象）
│   ├── techniques/      技術カード（8割）
│   ├── rules/           IBJJF v6.0 ルールカード
│   ├── safety/          禁忌・怪我予防（要人間レビュー）
│   ├── terminology/     用語
│   └── history/         歴史
├── src/domain/          判定ロジック・SRSアルゴリズム（純関数、テスト対象）
├── src/db/              IndexedDB(Dexie) の保存・エクスポート/インポート
├── src/ui/              画面
├── scripts/             validate / stats / find-orphans / find-outdated
└── docs/                要件定義・設計・ADR・運用手順（README には書かない詳細はここ）
\`\`\`

迷ったらこの順で見る:
「カードの内容がおかしい」→ `content/` の該当YAML → `provenance.ref` を辿って `ingest/raw/`
「判定がおかしい」→ `src/domain/grade.ts` とそのテスト
「なぜこの設計か」→ `docs/adr/`

---

## 4. カードを1枚追加/修正するときの最短手順

1. 内容の一次情報が `ingest/raw/` にあるか確認。なければ先にメモを追記する
   （AIに技術内容を考えさせるのは禁止 — `CLAUDE.md` 参照）
2. Claude Code に該当ファイルを指定して生成・修正させる
3. `npm run validate` を通す
4. `npm run stats` で比率と `verified: false` 件数を確認
5. `content/` の変更のみでコミット（1コミット1論点）
6. PRを出す。`safety_level: caution/critical` を含む場合は自分でレビューし
   `reviewed_by` を埋めてからマージ

詳細な分解方針（1技を何枚に割るか等）は `docs/card-authoring-guide.md`。

---

## 5. トラブルシューティング

| 症状 | 原因の見当 |
|---|---|
| `npm run validate` が `provenance` エラーで落ちる | `provenance.ref` が指す `ingest/raw/` のファイル・行が存在しない。ファイル移動/リネームを確認 |
| カードが出題されない | `verified: false` のまま、または `reviewed_by` 未設定（safety_levelがcaution以上）。レビューモードで確認可 |
| 学習履歴が消えた | ブラウザのサイトデータ削除、またはシークレットモードで開いた。定期的に `エクスポート` を取る |
| PWAが更新されない | Service Worker のキャッシュ。設定画面の「アプリを更新」、または一度アンインストールして再インストール |
| ルール改訂で内容が古くなった | `npm run find-outdated` で対象カードを列挙し、`docs/rule-revision-playbook.md` の手順で新版を追加（旧版は上書きしない） |

---

## 6. デプロイ

`main` への push で GitHub Actions が GitHub Pages へ自動デプロイする（`.github/workflows/deploy.yml`）。
公開URL: `<デプロイ後に記載>`

`content/` のみの変更（カード追加）はビルド時間が短く、通常数分でデプロイされる。

---

## 7. ライセンス・利用範囲

個人利用を前提に構築。道場内で他の生徒に配布する場合、
技術内容の一次情報は自分の指導ノートに基づくため、配布範囲は自分の裁量で判断する。
IBJJFルール記載部分の出典は各カードの `source` フィールドに明記されている。

---

## 関連ドキュメント

- 設計思想・要件: `docs/requirements.md` / `docs/architecture.md`
- カード分解の方針: `docs/card-authoring-guide.md`
- ルール改訂対応: `docs/rule-revision-playbook.md`
- セキュリティレビュー: `docs/security-review.md`
- Claude Code への実装規則: `CLAUDE.md`