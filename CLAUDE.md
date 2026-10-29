# 重要な前提: 本サービスは顧客ごとに異なるサーバー環境へデプロイされる

Backrest（本リポジトリ `sparticleinc/backrest`。上流 Backrest のオンプレミス向けカスタマイズ版で、
ビルドしたイメージは `docker.gbase.ai/gptbasesparticle/backrest` に公開される）は、複数の顧客の
それぞれ異なるサーバー（onprem_spark などの GBase Onprem 環境）にデプロイされる。これらのサーバーは互いに異なり、
デプロイユーザーの UID/GID、マウントボリュームの所有者、Docker daemon の GID、`/etc/passwd` に
どのアカウントがあるか、はマシンごとに違いうる。

**したがって、コードを書く際に特定の固定値がすべてのデプロイ環境で成り立つと仮定してはならない**。特に:

- UID/GID（`1002:1002` など）をハードコードしない。コンテナ内の実際の実行ユーザーは、
  `docker-entrypoint.sh` が起動時に `/userdata` ディレクトリの所有者を動的に検出して決める
  （`TARGET_UID=$(stat -c %u /userdata)`）ため、顧客のマシンごとにこの値は異なる。
  実例: `internal/api/sftputil/sftputil.go` はかつて SSH 秘密鍵 /
  known_hosts を書き込んだ後、ファイルをハードコードした `1002:1002` に強制的に `chown` していた（当時はプロセスが常に
  UID 1002 で動くと仮定していた）。しかしこの仮定は `85c9a12`（コンテナ起動時に自動で `/userdata`
  の所有者へ権限を落として実行する）以降すでに成り立たなくなっていた——onprem_spark では `/userdata` の所有者が 1001 で、プロセスも
  実際に 1001 で動いている。その結果、known_hosts への初回書き込みは成功するもののファイルが誤って
  1002:1002 に chown され、次の追記がそのまま permission denied になった（エラーメッセージは
  `failed to open known_hosts file: ... permission denied` のようなもの）。修正方法は、
  この種のハードコードされた chown を削除すること——プロセス自体がすでに正しいユーザーで動いているので、作成されるファイルは
  おのずと正しい所有者になり、手動で変更する必要はない。
- 特定のファイルパスやマウントポイントが必ず存在する、あるいは権限が必ず特定のモードであると仮定しない。
- コンテナが必ず root や特定の固定ユーザーで起動すると仮定しない。
- 権限・所有者に関わる変更は、`docker-entrypoint.sh` での権限降格
  （`setpriv --reuid/--regid`）+ capability（`CHOWN`/`DAC_READ_SEARCH`/
  `FOWNER`。`DAC_OVERRIDE` はないことに注意）という実際の実行モデルに照らして判断し、
  思い込みで「正しそうに見える」数値をハードコードしないこと。

ホストをまたぐ権限系の問題を調べるときは、まず顧客サーバー上で `docker exec ... cat
/proc/<pid>/status` を使ってプロセスの実際の UID/GID/Capability を確認し、それからコード内の仮定と照らし合わせること。
コンテナの起動ログやローカル開発環境での挙動だけを見て判断しない。

# 中国語を書かない

納品するソースコードには中国語（簡体字・中国語の語彙）を含めない。コメント・ログ・ドキュメント・CI の
ステップ名などはすべて日本語（または英語）で書く。CI では `scripts/check-chinese-residue.mjs --all`
で検査しており、中国語が残っているとビルドが失敗する。Git のコミットメッセージも日本語で書く。
