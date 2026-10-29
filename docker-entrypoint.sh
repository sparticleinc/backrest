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

# TARGET_UID/GID 是从宿主机 /userdata 属主抄来的任意数字，容器镜像的
# /etc/passwd 只烘焙了 root(0) 和 backrest(1002) 两个账号，客户服务器的
# 部署用户 uid 五花八门，大概率两个都对不上。多数工具靠上面的 $HOME 就能
# 正常工作，但 OpenSSH 客户端例外：它启动时会自己调用 getpwuid(当前 uid)
# 来解析"当前用户"，找不到条目就直接 fatal 退出（"No user exists for uid
# N"），不受 $HOME 影响。这会导致 restic 的 sftp 仓库在这类服务器上必现
# "server unexpectedly closed connection: unexpected EOF"（其实是本地 ssh
# 子进程秒退，不是远端服务器的问题）。这里还是 root，能写 /etc/passwd、
# /etc/group，补一条动态账号，一次性堵死这整类问题，不用再看某台服务器的
# uid 是否恰好撞上 0 或 1002。
if ! getent passwd "$TARGET_UID" >/dev/null 2>&1; then
  echo "backrest-runtime:x:${TARGET_UID}:${TARGET_GID}:backrest runtime user:/tmp:/sbin/nologin" >> /etc/passwd
fi
if ! getent group "$TARGET_GID" >/dev/null 2>&1; then
  echo "backrest-runtime:x:${TARGET_GID}:" >> /etc/group
fi

# restic 缓存目录里可能残留属主不是当前运行身份的文件：85c9a12 之前以 root
# 运行时写的缓存，或者 /userdata 属主变更前的旧 uid 写的。降权后没有
# DAC_OVERRIDE，restic 删改/新建这些缓存会 permission denied，prune 在
# repack 阶段直接 Fatal。趁现在还是 root，把属主不对的文件统一改回来；
# 只处理属主不对的文件，避免每次启动都把整个缓存（可能有几十 GB）遍历改一遍。
CACHE_DIR="${XDG_CACHE_HOME:-/cache}"
if [ -d "$CACHE_DIR" ]; then
  find "$CACHE_DIR" \( ! -user "$TARGET_UID" -o ! -group "$TARGET_GID" \) \
    -exec chown -h "$TARGET_UID:$TARGET_GID" {} +
fi

echo "entrypoint: run as ${TARGET_UID}:${TARGET_GID} (owner of /userdata), docker gid ${DOCKER_GID}"
# 部分挂载进来的文件（如 license-agent 写的运行时状态）属主是它自己容器内
# 烘焙的固定 uid，不是部署用户，权限位是 0600，普通降权身份读不到，会让
# backup-files.sh 的 rsync 失败并中止整次快照。
# 保留 DAC_READ_SEARCH：只绕过“读”权限检查，不含写/chmod/chown，所以
# 依旧不会产生本文件顶部说的那种 root 属主 dump（对比方案是整体以 root
# 跑，backrest 仓库 85c9a12 之前就是这样，因此在恢复时踩过 zookeeper
# rsync -a 报 Operation not permitted、license-agent 因属主不匹配 chmod
# 私钥失败而崩溃重启等问题，才改成现在的降权模式，见 gbase_onprem_deploy_config
# 的 596921a/e8d43dc）。
# 另外保留 CHOWN + FOWNER：restic restore 时要把还原文件的属主/权限位/
# 时间戳改回快照里记录的原始值（各服务各自的 uid，不一定等于 TARGET_UID），
# chown 需要 CHOWN；chown 完之后文件不再属于当前进程，后续恢复权限位/
# 时间戳则需要 FOWNER（实测：只加 CHOWN 时 chown 本身会成功，但恢复时间戳会
# 报 "operation not permitted"，restic 仍然会整体失败）。这两个能力只影响
# “改属主/改不属于自己的文件的属性”，不含 DAC_OVERRIDE，所以仍然不能绕过
# 普通的读写权限检查。运行这些 capability 需要 docker-compose.yml 给这个
# 服务加 cap_add: [DAC_READ_SEARCH, CHOWN, FOWNER]，否则下面的 bounding-set
# 里加不出来（setpriv 会直接报错退出，容器起不来）。
exec setpriv \
  --reuid "$TARGET_UID" --regid "$TARGET_GID" --groups "$DOCKER_GID" \
  --bounding-set=-all,+dac_read_search,+chown,+fowner \
  --inh-caps=-all,+dac_read_search,+chown,+fowner \
  --ambient-caps=-all,+dac_read_search,+chown,+fowner \
  --no-new-privs \
  /docker-entrypoint "$@"
