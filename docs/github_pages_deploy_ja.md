# Godot製アクションRPGをGitHub Pagesで公開する手順

この手順で、**Web版（HTML5）にエクスポートしたゲーム**を GitHub Pages で遊べるようにできます。

## 1. 前提

- Godot 4.x プロジェクトが `game/` 配下にある
- `game/project.godot` が存在する
- GitHub リポジトリのデフォルトブランチが `main`

## 2. Godot 側の設定（重要）

1. Godot でプロジェクトを開く
2. `Project > Export...` を開く
3. `Web`（HTML5）プリセットを追加
4. プリセット名を **`Web`** にする（GitHub Actions と一致させる）
5. 必要に応じて以下を調整
   - 画面サイズ（スマホ想定なら縦横比に注意）
   - 圧縮設定
   - スレッド・互換設定（端末やブラウザで問題が出る場合）
6. 保存して閉じる（`export_presets.cfg` が生成される）

## 3. GitHub Actions で自動デプロイ

このリポジトリには以下のワークフローを追加済みです。

- `.github/workflows/deploy-pages.yml`

このワークフローは次を行います。

1. `main` への push で起動
2. Godot をセットアップ
3. `game/` から Web 版を `dist/index.html` にエクスポート
4. GitHub Pages にデプロイ

`game/project.godot` がない場合は、`web/` 配下の静的ファイル（`index.html`, `game.js` など）をそのまま公開

## 4. GitHub 側の設定

1. GitHub リポジトリの `Settings > Pages` を開く
2. `Build and deployment` の Source を **GitHub Actions** にする
3. `main` に push する
4. Actions 完了後、表示された Pages URL でプレイ可能

## 5. よくあるハマりどころ

- `Web` プリセット名が違う → ワークフローが失敗
- `game/project.godot` がない → 失敗
- ブラウザで重い → 解像度と描画負荷（敵数/エフェクト）を下げる
- スマホ操作しづらい → タッチUIのボタンサイズ・配置を調整

## 6. 公開後に最低限やること

- iPhone Safari / Android Chrome の両方で動作確認
- 初回ロード時間の測定
- 3〜5分プレイで発熱・カクつき確認
- UIの誤タップ率確認（攻撃/回避/アイテム）


## 7. 追加済みの最小Webファイル

このリポジトリには、すぐ公開確認できる最小構成を追加しています。

- `web/index.html`
- `web/style.css`
- `web/game.js`

Godotプロジェクト未作成の段階でも、GitHub Pagesで操作感テストが可能です。
