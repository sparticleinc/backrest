# ソースから自己完結的にビルドするイメージ（CI 用）。
# Dockerfile.alpine / Dockerfile.scratch との違い: そちらの 2 つは goreleaser が事前に
# 各プラットフォームのバイナリをビルドコンテキストに置いておく前提だが、この Dockerfile はソースから直接コンパイルし、`docker build` 単体でビルドできる。
#
# マルチステージ構成:
#   1) webui  —— pnpm でフロントエンドをビルド（アーキテクチャ非依存。成果物 webui/dist は Go バイナリに embed される）
#   2) build  —— backrest と docker-entrypoint をクロスコンパイル（フロントエンドを埋め込み）
#   3) 実行イメージ —— alpine ベースで、restic などの依存をインストール（Dockerfile.alpine と揃える）
# syntax=docker/dockerfile:1

# Stage 1: フロントエンドのビルド（アーキテクチャ非依存）
FROM node:22-alpine AS webui
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /src/webui
COPY webui/package.json webui/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY webui/ ./
RUN pnpm run build

# Stage 2: Go バイナリのコンパイル（フロントエンドを埋め込み）
FROM golang:1.26-alpine AS build
RUN apk add --no-cache git
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# 第 1 ステージの成果物で embed ディレクトリを置き換え、コンテナ内で go generate（= npm build）を再実行しないようにする
COPY --from=webui /src/webui/dist ./webui/dist
# TARGETOS / TARGETARCH は buildx がターゲットプラットフォームに応じて自動で注入する
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

# Stage 3: 実行イメージ
FROM alpine:latest
LABEL org.opencontainers.image.source="https://github.com/garethgeorge/backrest"
# 基本ツールは公式 alpine イメージを踏襲。追加の jq / rsync / docker-cli-compose はデプロイ側の
# バックアップフックスクリプトで使う（jq で JSON を解析、rsync でファイルを同期、docker compose exec でホストのデーモンを再利用）。
# setpriv は docker-entrypoint.sh が起動時にホストのデプロイユーザーへ権限を落とすために使う。
RUN apk --no-cache add \
      tini ca-certificates curl bash rclone openssh tzdata \
      docker-cli docker-cli-compose jq rsync setpriv && \
    rclone selfupdate --stable

# Create backrest user (UID 1002) for running the application
# This user is used for SSH key handling and file ownership in container
RUN addgroup -g 1002 backrest && \
    adduser -D -u 1002 -G backrest backrest && \
    mkdir -p /home/backrest/.ssh && \
    chown -R backrest:backrest /home/backrest

RUN mkdir -p /tmp
COPY --from=build /out/backrest /backrest
COPY --from=build /out/docker-entrypoint /docker-entrypoint
# restic はビルド時にインストールしておく（ネイティブアーキテクチャのマシンでビルドするので QEMU エミュレーションは不要）。
# この RUN は下の ENV より前にあるため、install-deps はデフォルトの解決方法で必要なバージョンをデータディレクトリにダウンロードし、/bin へ移動する。
RUN /backrest --install-deps-only && \
    mkdir -p /bin && mv /root/.local/share/backrest/restic /bin/restic
# restic のパスを明示し、実行時は常にこのバイナリを使ってダウンロード・インストールが二度と走らないようにする。
ENV BACKREST_RESTIC_COMMAND=/bin/restic
# コンテナは root で起動し、entrypoint.sh が /userdata の所有者を検出してから権限を落として
# /docker-entrypoint を実行する（詳細は docker-entrypoint.sh 冒頭のコメントを参照）。
COPY docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/sbin/tini", "--", "/entrypoint.sh"]
CMD ["/backrest"]
