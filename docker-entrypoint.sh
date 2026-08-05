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
# 部分挂载进来的文件（如 license-agent 写的运行时状态）属主是它自己容器内
# 烘焙的固定 uid，不是部署用户，权限位是 0600，普通降权身份读不到，会让
# backup-files.sh 的 rsync 失败并中止整次快照。
# 保留 DAC_READ_SEARCH：只绕过“读”权限检查，不含写/chmod/chown，所以
# 依旧不会产生本文件顶部说的那种 root 属主 dump（对比方案是整体以 root
# 跑，backrest 仓库 85c9a12 之前就是这样，因此在恢复时踩过 zookeeper
# rsync -a 报 Operation not permitted、license-agent 因属主不匹配 chmod
# 私钥失败而崩溃重启等问题，才改成现在的降权模式，见 gbase_onprem_deploy_config
# 的 596921a/e8d43dc）。运行该 capability 需要 docker-compose.yml 给这个
# 服务加 cap_add: [DAC_READ_SEARCH]，否则下面的 bounding-set 里加不出来。
exec setpriv \
  --reuid "$TARGET_UID" --regid "$TARGET_GID" --groups "$DOCKER_GID" \
  --bounding-set=-all,+dac_read_search \
  --inh-caps=-all,+dac_read_search \
  --ambient-caps=-all,+dac_read_search \
  --no-new-privs \
  /docker-entrypoint "$@"
