# Fiscal Lens — 地方財政ダッシュボード

全国の市町村と47都道府県の財政を、ランキング・指標マップ・団体カルテ・地域ビューで比較するWebアプリです。画面上部のスイッチで市町村版と都道府県版を切り替えます。表示データはデジタル庁、総務省、e-Statの公式公表値から生成します。

**公開中のサイト → https://financial-strength-comparison.vercel.app/**

[![Fiscal Lens](public/og.jpg)](https://financial-strength-comparison.vercel.app/)

本サイトは非公式の分析支援ツールです。正確な値は必ず公表元をご確認ください。

## ローカル起動

Node.js 22.13.0以上を使用します。

```bash
npm install
npm run dev
```

品質検査・テスト・本番ビルドは次のコマンドでまとめて実行できます。

```bash
npm test
```

## 新しい年度への更新

### GitHub Actionsによる年次自動更新

`.github/workflows/annual-data-update.yml` は、毎年7月1日3時17分（日本時間）に次の処理を自動実行します。

1. デジタル庁から市町村版・都道府県版の最新データを取得
2. 新年度の有無と、両版の最新年度が一致することを確認
3. 欠損・重複・値の範囲・構成比・年度連続性を検査
4. 型検査、画面テスト、本番ビルドを実行
5. すべて合格し、実質的な変更がある場合だけ既定ブランチへ自動コミット
6. 失敗した場合は、同じ年の通知Issueを作成または更新

まだ新年度が公開されていない場合や、取得日時だけが変わった場合は、ファイルを変更せず正常終了します。GitHubのActions画面にある「Run workflow」から手動実行することもできます。

新年度の健全化判断比率ページが設定ファイルに未登録の場合は、手動実行時に次を入力できます。

- `health_page`: 総務省の確報ページURL
- `health_published_at`: 公表日（YYYY-MM-DD）
- `force`: 同じ年度の訂正版を取り込む場合だけ有効化

初回利用前に、GitHubリポジトリの設定でActionsの書き込み権限を許可してください。

- Settings → Actions → General → Workflow permissions
- 「Read and write permissions」を選択
- Issuesを有効化
- 既定ブランチを保護している場合は、GitHub Actionsによる書き込みを許可するか、運用に合わせてワークフローをPR方式へ変更

> [!IMPORTANT]
> このActionsは既定ブランチへ直接コミットします。本番はVercelにホストしており、
> 既定ブランチへのpushで**自動デプロイされます**。つまり年次更新は、検査に合格する限り
> レビューなしで本番へ反映されます。
>
> 反映前に必ず目視確認したい場合は、ワークフロー末尾の `git push origin HEAD:<既定ブランチ>` を
> 作業ブランチへのpush＋PR作成に変更してください。

### 手動更新

デジタル庁の「地方財政（市町村ごと）」に新しいZIPが公開された後、次のコマンドを実行します。

```bash
npm run data:update
```

「地方財政（都道府県ごと）」の更新は次のコマンドです。

```bash
npm run data:update:prefectures
```

両方の新年度が公開されたときは、市町村版を先に更新してください。都道府県版の人口は、市町村版の住民基本台帳人口を都道府県単位に集計するためです。

このコマンドは次の処理を自動で行います。

1. デジタル庁の公開ページから最新ZIPを検出して取得
2. CSVに含まれる年度を調べ、直近5年度を自動選択
3. e-Statと総務省確報から実質赤字比率・連結実質赤字比率を取得
4. 団体数、47都道府県、欠損、重複、値の範囲、年度の連続性を検査
5. すべて合格したときだけ表示用JSONと軽量メタデータを差し替え

検査に失敗した場合、公開中のJSONは変更されません。成功時は更新前データを `public/official-data.json.previous` に保存します。

### 新年度の赤字比率がe-Statにまだない場合

総務省の新しい「健全化判断比率・資金不足比率（確報）」ページを指定して実行できます。

```bash
npm run data:update -- --health-page "総務省の確報ページURL"
```

継続運用する場合は `scripts/data-sources.json` の `annualHealthRatios` に年度、ページURL、公表日を登録します。全国すべての団体が「赤字なし」と公式発表された年度だけ、`allClear: true` を設定できます。出典未登録の年度を自動的にゼロ扱いすることはありません。

### 手元のZIP展開済みデータでリハーサルする場合

```bash
npm run data:update -- --input-dir "CSVフォルダー" --snapshot YYYY-MM-DD
```

### 更新後の確認

```bash
npm run data:check
npm run data:check:prefectures
npm test
```

画面の対象年度、取得日、団体数、出典欄は生成データの内容から自動表示されるため、年度更新時に画面文言を手修正する必要はありません。全国データは `public/official-data.json` から初回表示後に取得し、画面本体のJavaScriptには同梱しません。

## 主なファイル

- `scripts/data-sources.json`: 公開元URLと年度別の赤字比率確報
- `scripts/update-official-data.mjs`: ダウンロード、結合、検査、差し替え
- `scripts/update-prefectural-data.mjs`: 都道府県版のダウンロード、結合、検査、差し替え
- `scripts/prepare-annual-update.mjs`: 市町村版と都道府県版を一括更新し、変更なしの場合は元に戻す年次処理
- `scripts/generate-official-data.mjs`: 表示用JSONの生成
- `scripts/generate-prefectural-data.mjs`: 都道府県版JSONの生成
- `scripts/validate-official-data.mjs`: データ品質検査
- `scripts/validate-prefectural-data.mjs`: 47都道府県・年度・指標・構成比の品質検査
- `public/official-data.json`: 初回表示後に取得する公式データ
- `public/prefectural-data.json`: 初回表示後に取得する都道府県公式データ
- `app/official-data-meta.json`: 初期画面に必要な年度・取得日・出典だけを持つ軽量メタデータ
- `app/prefectural-data-meta.json`: 都道府県版の軽量メタデータ
- `.github/workflows/annual-data-update.yml`: 年次自動更新、検査、コミット、失敗通知

## 更新時の注意

- 総務省やデジタル庁がファイル名・列名・シート名を変更した場合、更新処理は安全のため停止します。
- 団体の合併などで団体数が前回から20以上変化した場合も停止します。公表資料を確認してから検査条件を見直してください。
- `public/official-data.json.previous` から直前のデータへ戻せます。内容確認後に手動で差し替えてください。
