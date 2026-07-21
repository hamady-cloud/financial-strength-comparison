# Fiscal Lens — 市町村財政ダッシュボード

全国の市町村財政を、ランキング・指標マップ・団体カルテ・都道府県ビューで比較するWebアプリです。表示データはデジタル庁、総務省、e-Statの公式公表値から生成します。

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

デジタル庁の「地方財政（市町村ごと）データテーブル」に新しいZIPが公開された後、次の1コマンドを実行します。

```bash
npm run data:update
```

このコマンドは次の処理を自動で行います。

1. デジタル庁の公開ページから最新ZIPを検出して取得
2. CSVに含まれる年度を調べ、直近5年度を自動選択
3. e-Statと総務省確報から実質赤字比率・連結実質赤字比率を取得
4. 団体数、47都道府県、欠損、重複、値の範囲、年度の連続性を検査
5. すべて合格したときだけ `app/official-data.json` を差し替え

検査に失敗した場合、公開中のJSONは変更されません。成功時は更新前データを `app/official-data.json.previous` に保存します。

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
npm test
```

画面の対象年度、取得日、団体数、出典欄は `official-data.json` の内容から自動表示されるため、年度更新時に画面文言を手修正する必要はありません。

## 主なファイル

- `scripts/data-sources.json`: 公開元URLと年度別の赤字比率確報
- `scripts/update-official-data.mjs`: ダウンロード、結合、検査、差し替え
- `scripts/generate-official-data.mjs`: 表示用JSONの生成
- `scripts/validate-official-data.mjs`: データ品質検査
- `app/official-data.json`: アプリが読み込む公式データ

## 更新時の注意

- 総務省やデジタル庁がファイル名・列名・シート名を変更した場合、更新処理は安全のため停止します。
- 団体の合併などで団体数が前回から20以上変化した場合も停止します。公表資料を確認してから検査条件を見直してください。
- `app/official-data.json.previous` から直前のデータへ戻せます。内容確認後に手動で差し替えてください。
