#!/bin/sh
# 私有化部署入口：始终以 /userdata 挂载目录的属主身份运行 backrest。
# 这样备份钩子写出的 dump、restic 快照里记录的 uid/gid、恢复到 /restore 的
# 输出文件，属主都与宿主机部署用户一致，宿主机侧不会产生 root 文件，
# restore.sh 也无需 sudo。
# uid/gid 与 docker.sock 的组 GID 均在启动时自动探测：不同客户服务器的
# 部署用户 uid 各不相同，无需在 docker-compose.yml 里逐台配置。
set -eu

TARGET_UID="$(stat -c %u /userdata)"
TARGET_GID="$(stat -c %g /userdata)"
# 钩子脚本里的 docker compose exec 需要访问 docker.sock，把它的属组
# 作为附加组带上。
DOCKER_GID="$(stat -c %g /var/run/docker.sock)"

# 降权后的 uid 没有 passwd 条目，HOME 仍指向不可读的 /root；
# 指到 /tmp（挂载自宿主机，可写），供 ssh 等工具存放临时状态。
export HOME=/tmp

echo "entrypoint: run as ${TARGET_UID}:${TARGET_GID} (owner of /userdata), docker gid ${DOCKER_GID}"
exec setpriv --reuid "$TARGET_UID" --regid "$TARGET_GID" --groups "$DOCKER_GID" /docker-entrypoint "$@"
