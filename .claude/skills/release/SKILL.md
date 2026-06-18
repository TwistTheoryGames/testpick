---
name: release
description: testpickの新バージョンをnpmに公開する。release、publish、リリース、公開、バージョンを上げて公開と言われたら使用。
user-invocable: true
allowed-tools: Bash
---

# Release testpick

公開物はユーザーのマシンで動く。**壊れた版を出さないため、必ず CI 緑を待ってから
publish する。** （0.1.0 は CI を待たずに公開し、Node 18/20 で壊れた版を出してしまった。）

## ⭐️ ゴールデンルール（運用）

**git push → CI緑を確認 → それから npm publish。**
この順を守れば、壊れた版を世に出さずに済む。

## 手順

1. **ローカル検証**: `node --test`（緑であること）
2. **バージョン更新**: `package.json` の `version` を semver で上げる
   （fix=patch / feat=minor）
3. **コミット & プッシュ**: `git add -A && git commit && git push`
4. **CIを待つ**: Node 18/20/22 すべて緑になるまで待つ
   ```bash
   gh run list --limit 1 --json status,conclusion -q '.[0].status+" "+(.[0].conclusion//"")'
   ```
   `completed success` を確認。**赤なら publish しない**——修正して 1 に戻る。
5. **公開（メンテナのターミナルで実行）**: npm は 2FA 有効なので対話必須。
   自動ツールからは publish できない。ユーザーに依頼:
   ```bash
   cd ~/projects/testpick && npm publish --access public
   ```
   ブラウザ認証を承認 → `+ testpick@<version>` で成功。
6. **確認**:
   ```bash
   npm view testpick version
   npx -y testpick@<version> --help
   ```

## 公開後に問題が見つかったら

修正版を先に公開してから、壊れた版を deprecate:
```bash
npm deprecate testpick@<bad> "Broken on <...>; please use <good>+"
```

## Node互換チェック（リリース前必須）

- `fs.globSync` など **Node 22+ 専用APIを使っていない**こと（最小サポートは Node 18）
- 詳細は `.claude/rules/release.md`
