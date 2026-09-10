# 重要背景：本服务部署在不同客户的服务器环境中

Backrest（本仓库 `sparticleinc/backrest`，上游 Backrest 的私有化定制版；构建出的
镜像发布到 `docker.gbase.ai/gptbasesparticle/backrest`）会被部署到多个客户的
不同服务器上（例如 onprem_spark 等 GBase Onprem 环境）。这些服务器互不相同：
部署用户的 UID/GID、挂载卷属主、Docker daemon 的 GID、`/etc/passwd` 里有哪些
账号，在每台机器上都可能不一样。

**因此写代码时不要假设某个固定值在所有部署环境里都成立**，尤其是：

- 不要硬编码 UID/GID（如 `1002:1002`）。容器内实际运行身份由
  `docker-entrypoint.sh` 在启动时动态探测 `/userdata` 目录属主决定
  （`TARGET_UID=$(stat -c %u /userdata)`），不同客户机器上这个值不同。
  真实案例：`internal/api/sftputil/sftputil.go` 曾经在写完 SSH 私钥 /
  known_hosts 后，把文件强行 `chown` 成写死的 `1002:1002`（当时假设进程固定以
  UID 1002 运行）。但这个假设在 `85c9a12`（容器启动时自动降权为 `/userdata`
  属主运行）之后就已经不成立——onprem_spark 上 `/userdata` 属主是 1001，进程
  实际以 1001 运行。结果第一次写 known_hosts 成功后文件被错误 chown 成
  1002:1002，导致下一次追加写入直接 permission denied（错误信息类似
  `failed to open known_hosts file: ... permission denied`）。修复方式是删掉
  这类硬编码 chown——进程本身已经以正确的目标身份运行，创建的文件天然就是
  正确属主，不需要再手动改。
- 不要假设某个文件路径、挂载点一定存在或权限一定是某个固定模式。
- 不要假设容器一定以 root 或某个固定用户启动。
- 涉及权限/属主相关的改动，要结合 `docker-entrypoint.sh` 里降权
  （`setpriv --reuid/--regid`）+ capability（`CHOWN`/`DAC_READ_SEARCH`/
  `FOWNER`，注意没有 `DAC_OVERRIDE`）的实际运行模型来判断，而不是想当然地
  写死一个"看起来对的"数字。

排查跨主机权限类问题时，优先去客户服务器上用 `docker exec ... cat
/proc/<pid>/status` 核实进程真实 UID/GID/Capability，再对照代码里的假设，
而不是只看容器启动日志或本地开发环境的行为。
