---
name: commit-push
description: gitにコミットしてリモートにプッシュする。commit and push、コミットしてプッシュ、push、プッシュと言われたら使用。
user-invocable: true
allowed-tools: Bash
---

# Commit & Push (testpick)

## Instructions

1. `node --test` を実行し、**テストが緑であることを確認**（赤ならコミットしない）
2. `git status` と `git diff` で変更を確認
3. 適切なコミットメッセージを作成
4. `git add -A` → `git commit` → `git push`

## コミットメッセージ規約

```
<type>: <subject>

<body (任意)>

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```

| Type | 用途 |
|------|------|
| `feat` | 新機能 |
| `fix` | バグ修正 |
| `docs` | ドキュメント |
| `refactor` | リファクタリング |
| `test` | テスト |
| `chore` | ビルド・設定・雑務 |

## 注意

- ランタイム依存やビルドステップを足さない（プレーンNode ESMを維持）
- `.DS_Store` など不要ファイルをコミットしない（`.gitignore` 済み）
- **公開（npm publish）はコミット/プッシュとは別**。リリースは `release` スキルへ。
  push しただけでは公開されない。
