# 从源码自包含构建的镜像（供 CI 使用）。
# 与 Dockerfile.alpine / Dockerfile.scratch 不同：那两个依赖 goreleaser 预先
# 把各平台二进制放进构建上下文；本 Dockerfile 直接从源码编译，可用 `docker build` 独立构建。
#
# 多阶段：
#   1) webui  —— 用 pnpm 构建前端（与架构无关，产物 webui/dist 会被 Go 二进制 embed）
#   2) build  —— 交叉编译 backrest 与 docker-entrypoint（内嵌前端）
#   3) 运行镜像 —— 基于 alpine，安装 restic 等依赖（与 Dockerfile.alpine 保持一致）
# syntax=docker/dockerfile:1

# Stage 1: 构建前端（架构无关）
FROM node:22-alpine AS webui
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /src/webui
COPY webui/package.json webui/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY webui/ ./
RUN pnpm run build

# Stage 2: 编译 Go 二进制（内嵌前端）
FROM golang:1.26-alpine AS build
RUN apk add --no-cache git
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# 用第一阶段产物替换 embed 目录，避免在容器内再跑 go generate（即 npm build）
COPY --from=webui /src/webui/dist ./webui/dist
# TARGETOS / TARGETARCH 由 buildx 按目标平台自动注入
ARG TARGETOS
ARG TARGETARCH
ARG BACKREST_BUILD_VERSION=0.0.0-ci
ENV CGO_ENABLED=0
RUN GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -tags tray \
      -ldflags "-s -w -X main.version=${BACKREST_BUILD_VERSION}" \
      -o /out/backrest ./cmd/backrest
RUN GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build \
      -ldflags "-s -w" \
      -o /out/docker-entrypoint ./cmd/docker-entrypoint

# Stage 3: 运行镜像
FROM alpine:latest
LABEL org.opencontainers.image.source="https://github.com/garethgeorge/backrest"
# 基础工具沿用官方 alpine 镜像；额外的 jq / rsync / docker-cli-compose 供部署侧的
# 备份钩子脚本使用（jq 解析 JSON、rsync 同步文件、docker compose exec 复用宿主守护进程）。
RUN apk --no-cache add \
      tini ca-certificates curl bash rclone openssh tzdata \
      docker-cli docker-cli-compose jq rsync && \
    rclone selfupdate --stable
RUN mkdir -p /tmp
COPY --from=build /out/backrest /backrest
COPY --from=build /out/docker-entrypoint /docker-entrypoint
# 构建时就把 restic 装好（在原生架构机器上构建，无需 QEMU 模拟）。
# 此 RUN 早于下面的 ENV，故 install-deps 走默认解析、下载所需版本到数据目录，再移到 /bin。
RUN /backrest --install-deps-only && \
    mkdir -p /bin && mv /root/.local/share/backrest/restic /bin/restic
# 显式指定 restic 路径，运行时直接使用该二进制、永不再触发下载安装。
ENV BACKREST_RESTIC_COMMAND=/bin/restic
ENTRYPOINT ["/sbin/tini", "--", "/docker-entrypoint"]
CMD ["/backrest"]
