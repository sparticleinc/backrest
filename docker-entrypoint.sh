#!/bin/sh
# オンプレミス配備用のエントリポイント: backrest を常に /userdata マウントディレクトリの所有者として実行する。
# これにより、バックアップフックが書き出す dump、restic スナップショットに記録される uid/gid、/restore への
# リストア出力ファイルの所有者がすべてホスト側のデプロイユーザーと一致し、ホスト側に root 所有のファイルが生まれず、
# restore.sh も sudo なしで動く。
# uid/gid と docker.sock のグループ GID はいずれも起動時に自動検出する: 顧客サーバーごとに
# デプロイユーザーの uid が異なるため、docker-compose.yml でサーバーごとに設定する必要はない。
set -eu

TARGET_UID="$(stat -c %u /userdata)"
TARGET_GID="$(stat -c %g /userdata)"
# フックスクリプト内の docker compose exec は docker.sock へのアクセスが必要なので、そのグループを
# 補助グループとして付与する。
DOCKER_GID="$(stat -c %g /var/run/docker.sock)"

# 権限を落とした後の uid には passwd エントリがなく、HOME は読めない /root のままになるため、
# /tmp（ホストからマウントされ書き込み可能）を指すようにし、ssh などのツールが一時状態を置けるようにする。
export HOME=/tmp

# TARGET_UID/GID はホストの /userdata の所有者から取った任意の数値だが、コンテナイメージの
# /etc/passwd には root(0) と backrest(1002) の 2 アカウントしか焼き込まれておらず、顧客サーバーの
# デプロイユーザーの uid はまちまちなので、どちらにも一致しない可能性が高い。大半のツールは上の $HOME だけで
# 正常に動くが、OpenSSH クライアントは例外: 起動時に自分で getpwuid(現在の uid) を呼んで
# 「現在のユーザー」を解決し、エントリが見つからないとそのまま fatal で終了する（"No user exists for uid
# N"）。$HOME の影響は受けない。このため、こうしたサーバーでは restic の sftp リポジトリで必ず
# "server unexpectedly closed connection: unexpected EOF" が発生する（実際はローカルの ssh
# 子プロセスが即座に終了しているだけで、リモートサーバーの問題ではない）。ここではまだ root なので /etc/passwd・
# /etc/group に書き込めるため、動的アカウントを 1 件追加してこの種の問題をまとめて塞ぐ。サーバーごとに
# uid がたまたま 0 や 1002 と一致するかを気にする必要がなくなる。
if ! getent passwd "$TARGET_UID" >/dev/null 2>&1; then
  echo "backrest-runtime:x:${TARGET_UID}:${TARGET_GID}:backrest runtime user:/tmp:/sbin/nologin" >> /etc/passwd
fi
if ! getent group "$TARGET_GID" >/dev/null 2>&1; then
  echo "backrest-runtime:x:${TARGET_GID}:" >> /etc/group
fi

# restic のキャッシュディレクトリには、現在の実行ユーザー以外が所有するファイルが残っている場合がある: 85c9a12 より前に root で
# 実行していた頃に書かれたキャッシュや、/userdata の所有者が変わる前の旧 uid が書いたもの。権限を落とした後は
# DAC_OVERRIDE がないため、restic がこれらのキャッシュを削除・変更・新規作成すると permission denied になり、prune が
# repack 段階で Fatal になる。まだ root のうちに、所有者が正しくないファイルをまとめて戻しておく。
# 対象は所有者が正しくないファイルだけに絞り、起動のたびにキャッシュ全体（数十 GB になりうる）を走査して変更するのを避ける。
CACHE_DIR="${XDG_CACHE_HOME:-/cache}"
if [ -d "$CACHE_DIR" ]; then
  find "$CACHE_DIR" \( ! -user "$TARGET_UID" -o ! -group "$TARGET_GID" \) \
    -exec chown -h "$TARGET_UID:$TARGET_GID" {} +
fi

echo "entrypoint: run as ${TARGET_UID}:${TARGET_GID} (owner of /userdata), docker gid ${DOCKER_GID}"
# マウントされたファイルの一部（license-agent が書く実行時状態など）は、そのコンテナ内に
# 焼き込まれた固定 uid が所有者で、デプロイユーザーではなく、パーミッションも 0600 のため、権限を落とした通常の身元では読めず、
# backup-files.sh の rsync が失敗してスナップショット全体が中断される。
# DAC_READ_SEARCH は残す: 「読み取り」の権限チェックだけを回避し、書き込み・chmod・chown は含まないので、
# このファイル冒頭で述べた root 所有の dump は依然として生まれない（比較対象は全体を root で
# 動かす方式で、backrest リポジトリの 85c9a12 より前はそうしていた。そのためリストア時に zookeeper の
# rsync -a が Operation not permitted を出す、license-agent が所有者不一致で秘密鍵の chmod に
# 失敗してクラッシュ・再起動を繰り返す、といった問題に遭遇し、現在の降格方式に切り替えた。gbase_onprem_deploy_config
# の 596921a/e8d43dc を参照）。
# さらに CHOWN + FOWNER も残す: restic restore では、復元したファイルの所有者・パーミッション・
# タイムスタンプをスナップショットに記録された元の値（各サービス固有の uid で、TARGET_UID と同じとは限らない）に戻す必要があり、
# chown には CHOWN が要る。chown した後はファイルが現在のプロセスの所有ではなくなるため、続くパーミッション・
# タイムスタンプの復元には FOWNER が要る（実測: CHOWN だけを付けた場合、chown 自体は成功するがタイムスタンプの復元で
# "operation not permitted" となり、restic は結局全体として失敗する）。この 2 つの capability が影響するのは
# 「所有者の変更／自分が所有しないファイルの属性変更」だけで、DAC_OVERRIDE は含まないため、依然として
# 通常の読み書き権限チェックは回避できない。これらの capability を使うには、docker-compose.yml でこの
# サービスに cap_add: [DAC_READ_SEARCH, CHOWN, FOWNER] を付ける必要がある。付けないと下の bounding-set
# に追加できない（setpriv がエラーで終了し、コンテナが起動しない）。
exec setpriv \
  --reuid "$TARGET_UID" --regid "$TARGET_GID" --groups "$DOCKER_GID" \
  --bounding-set=-all,+dac_read_search,+chown,+fowner \
  --inh-caps=-all,+dac_read_search,+chown,+fowner \
  --ambient-caps=-all,+dac_read_search,+chown,+fowner \
  --no-new-privs \
  /docker-entrypoint "$@"
