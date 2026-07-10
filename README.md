<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./webui/assets/logo.svg" width="400px">
    <source media="(prefers-color-scheme: light)" srcset="./webui/assets/logo.svg" width="400px">
    <img src="./webui/assets/logo.svg" width="400px">
  </picture>
</p>

<p align="center">
  <img src="https://github.com/garethgeorge/backrest/actions/workflows/test.yml/badge.svg" />
  <img src="https://img.shields.io/github/downloads/garethgeorge/backrest/total" />
  <img src="https://img.shields.io/docker/pulls/garethgeorge/backrest" />
</p>

---

**Overview**

Backrest is a web-accessible backup solution built on top of [restic](https://restic.net/). Backrest provides a WebUI which wraps the restic CLI and makes it easy to create repos, browse snapshots, and restore files. Additionally, Backrest can run in the background and take an opinionated approach to scheduling snapshots and orchestrating repo health operations.

By building on restic, Backrest leverages its mature, fast, reliable, and secure backup capabilities while adding an intuitive interface.

Built with Go, Backrest is distributed as a standalone, lightweight binary with restic as its sole dependency. It can securely create new repositories or manage existing ones. Once storage is configured, the WebUI handles most operations, while still allowing direct access to the powerful [restic CLI](https://restic.readthedocs.io/en/latest/manual_rest.html) for advanced operations when needed.

## Key Features

- **Web Interface**: Access locally or remotely (perfect for NAS deployments)
- **Multi-Platform Support**: 
  - Linux
  - macOS
  - Windows
  - FreeBSD
  - [Docker](https://hub.docker.com/r/garethgeorge/backrest)
- **Backup Management**:
  - Import existing restic repositories
  - Cron-scheduled backups and maintenance (e.g. prune, check, forget, etc)
  - Browse and restore files from snapshots
  - Configurable notifications (Discord, Slack, Shoutrrr, Gotify, Healthchecks)
  - Pre/post backup command hooks to execute shell scripts
- **Storage Options**:
  - Compatible with rclone remotes
  - Supports all restic storage backends (S3, B2, Azure, GCS, local, SFTP, and [all rclone remotes](https://rclone.org/))

## Preview

<p align="center">
   <img src="https://f000.backblazeb2.com/file/gshare/screenshots/backrest-1.11.1-dashboard.png" width="80%" />
   <img src="https://f000.backblazeb2.com/file/gshare/screenshots/backrest-1.11.1-browse-snapshot.png" width="80%" />
   <img src="https://f000.backblazeb2.com/file/gshare/screenshots/backrest-1.11.1-add-plan.png" width="80%" />
</p>

---

# User Guide

[See the Backrest docs](https://garethgeorge.github.io/backrest/introduction/getting-started).

---

# Installation

Backrest is packaged as a single executable. It runs directly on Linux, macOS, and Windows. [restic](https://github.com/restic/restic) is downloaded automatically on first run.

Once installed, access Backrest at `http://localhost:9898` (default port). First-time setup will prompt for username and password creation.

> [!NOTE]
> To change the default port, set the `BACKREST_PORT` environment variable (e.g., `BACKREST_PORT=0.0.0.0:9898` to listen on all interfaces). The install script accepts `--allow-remote-access` as a shortcut for this.
>
> Backrest will use your system's installed version of restic if it's available and compatible. If not, Backrest will download and install a suitable version in its data directory, keeping it updated. To use a specific restic binary, set the `BACKREST_RESTIC_COMMAND` environment variable to the desired path.

## Linux & macOS (Recommended)

The install script downloads the latest release, drops the binary into `/usr/local/bin`, and sets up the appropriate auto-start integration (systemd or OpenRC on Linux; launchd on macOS):

```sh
curl -fsSL https://raw.githubusercontent.com/garethgeorge/backrest/main/install.sh | bash
```

Flags go after `--`:

```sh
# Bind to all interfaces (default: 127.0.0.1:9898)
curl -fsSL https://raw.githubusercontent.com/garethgeorge/backrest/main/install.sh | bash -s -- --allow-remote-access

# Uninstall (removes service, autostart entry, and /usr/local/bin/backrest)
curl -fsSL https://raw.githubusercontent.com/garethgeorge/backrest/main/install.sh | bash -s -- --uninstall
```

The service runs as your user by default (so config and data live under your `$HOME`). To install as `root` instead, pass `--root`. After install, access Backrest at `http://localhost:9898`.

> [!TIP]
> Review [install.sh](./install.sh) before piping it into a shell. You can also clone the repo and run `./install.sh` locally; it accepts the same flags.

### macOS — Homebrew (alternative)

[Homebrew tap](https://github.com/garethgeorge/homebrew-backrest-tap):

```sh
brew tap garethgeorge/homebrew-backrest-tap
brew install backrest
brew services start backrest
```

> [!NOTE]
> You may need to grant Full Disk Access to Backrest. Go to `System Preferences > Security & Privacy > Privacy > Full Disk Access` and add `/usr/local/bin/backrest`.

### Arch Linux (AUR)

[Backrest on AUR](https://aur.archlinux.org/packages/backrest) is third-party (not maintained by the Backrest project) and tweaks the systemd unit; see the [AUR service file](https://aur.archlinux.org/cgit/aur.git/tree/backrest@.service?h=backrest) for details.

```sh
paru -Sy backrest  # or: yay -Sy backrest
sudo systemctl enable --now backrest@$USER.service
```

## Docker

Image: `ghcr.io/garethgeorge/backrest` (also on [Docker Hub](https://hub.docker.com/r/garethgeorge/backrest)).
- Includes rclone and common Unix utilities
- For a minimal image, use `ghcr.io/garethgeorge/backrest:scratch`

### Docker Compose

```yaml
version: "3.8"
services:
  backrest:
    image: ghcr.io/garethgeorge/backrest:latest
    container_name: backrest
    hostname: backrest
    volumes:
      - ./backrest/data:/data
      - ./backrest/config:/config
      - ./backrest/cache:/cache
      - ./backrest/tmp:/tmp
      - ./backrest/rclone:/root/.config/rclone # Mount for rclone config (needed when using rclone remotes)
      - /path/to/backup/data:/userdata  # Mount local paths to backup
      - /path/to/local/repos:/repos     # Mount local repos (optional for remote storage)
    environment:
      - BACKREST_DATA=/data
      - BACKREST_CONFIG=/config/config.json
      - XDG_CACHE_HOME=/cache
      - TMPDIR=/tmp
      - TZ=America/Los_Angeles
    ports:
      - "9898:9898"
    restart: unless-stopped
```

## Windows

Download the Windows installer for your architecture from the [releases page](https://github.com/garethgeorge/backrest/releases). The installer, named `Backrest-setup-[arch].exe`, places Backrest and a GUI tray application in `%localappdata%\Programs\Backrest\`. The tray application, set to start on login, monitors Backrest.

> [!TIP]
> To override the default port before installation, set a user environment variable named `BACKREST_PORT`. On Windows 10+, navigate to Settings > About > Advanced system settings > Environment Variables. Under "User variables", create a new variable `BACKREST_PORT` with the value `127.0.0.1:port` (e.g. `127.0.0.1:8080`). If changing post-installation, re-run the installer to update shortcuts with the new port.

---

# Configuration

## Environment Variables (Unix)

| Variable                  | Description                 | Default                                                                                                             |
| ------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `BACKREST_PORT`           | Port to bind to             | 127.0.0.1:9898 (or 0.0.0.0:9898 for the docker images)                                                              |
| `BACKREST_CONFIG`         | Path to config file         | `$HOME/.config/backrest/config.json`<br>(or, if `$XDG_CONFIG_HOME` is set, `$XDG_CONFIG_HOME/backrest/config.json`) |
| `BACKREST_DATA`           | Path to the data directory  | `$HOME/.local/share/backrest`<br>(or, if `$XDG_DATA_HOME` is set, `$XDG_DATA_HOME/backrest`)                        |
| `BACKREST_RESTIC_COMMAND` | Path to restic binary       | Defaults to a Backrest managed version of restic at `$XDG_DATA_HOME/backrest/restic-x.x.x`                          |
| `XDG_CACHE_HOME`          | Path to the cache directory |                                                                                                                     |

## Environment Variables (Windows)

| Variable                  | Description                 | Default                                                                                    |
| ------------------------- | --------------------------- | ------------------------------------------------------------------------------------------ |
| `BACKREST_PORT`           | Port to bind to             | 127.0.0.1:9898                                                                             |
| `BACKREST_CONFIG`         | Path to config file         | `%appdata%\backrest\config.json`                                                           |
| `BACKREST_DATA`           | Path to the data directory  | `%appdata%\backrest\data`                                                                  |
| `BACKREST_RESTIC_COMMAND` | Path to restic binary       | Defaults to a Backrest managed version of restic in `C:\Program Files\restic\restic-x.x.x` |
| `XDG_CACHE_HOME`          | Path to the cache directory |                                                                                            |


# Development

## Contributing

Contributions are welcome! See the [issues](https://github.com/garethgeorge/backrest/issues) or feel free to open a new issue to discuss a project. Beyond the core codebase, contributions to [documentation](https://garethgeorge.github.io/backrest/introduction/getting-started), [cookbooks](https://garethgeorge.github.io/backrest/cookbooks/command-hook-examples), and testing are always welcome.

## Build Dependencies

All build dependencies are defined in `shell.nix` and can be activated automatically using [Nix](https://nixos.org/) and [direnv](https://direnv.net/).

### Using Nix + direnv (Recommended)

1. Install [Nix](https://nixos.org/download/) and [direnv](https://direnv.net/docs/installation.html)
2. [Hook direnv into your shell](https://direnv.net/docs/hook.html) (e.g. `eval "$(direnv hook bash)"` in your `.bashrc`)
3. Clone the repo and `cd` into it
4. Run `direnv allow` to trust the `.envrc` — all dependencies (Go, Node.js, pnpm, protoc, buf, etc.) will be available in your shell automatically

### Manual Setup

If you prefer not to use Nix, install the following manually:

- [Go](https://go.dev/) 1.24 or greater
- [Node.js](https://nodejs.org/en) 20.x and [pnpm](https://pnpm.io/) 9
- [goreleaser](https://github.com/goreleaser/goreleaser) `go install github.com/goreleaser/goreleaser/v2@latest`

**(Optional) To edit protobuf definitions:**

```sh
apt install -y protobuf-compiler
go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest
go install github.com/bufbuild/buf/cmd/buf@latest
go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
go install connectrpc.com/connect/cmd/protoc-gen-connect-go@latest
npm install -g @bufbuild/protoc-gen-es
```

## Compiling

```sh
(cd webui && pnpm i && pnpm run build)
(cd cmd/backrest && go build .)
```

## 本地开发启动（热重载）

日常开发时，把后端和前端作为两个独立进程分别启动。Vite 开发服务器以热模块替换（HMR）的方式提供 WebUI，并把 API 请求代理到后端，因此前端改动会立即生效，无需重新构建。


**1. 先启动前端**（Vite 开发服务器，地址 `http://localhost:5173`）：

```sh
cd webui && pnpm i && pnpm start  
```

**2. 再运行后端**（在 `127.0.0.1:9898` 上提供 API）：

如果没有安装air的话，需要先安装
```bash
go install github.com/air-verse/air@latest
```
运行项目：
```sh
cd cmd/backrest
export BACKREST_DATA=/tmp/backrest-dev/data
export BACKREST_CONFIG=/tmp/backrest-dev/config.json
export BACKREST_GBASE_AUTH_URL="https://onprem-dev.gbase.ai/"
air
```


然后打开 **http://localhost:5173**（不是 `:9898`）。首次运行时会自动把 restic 二进制下载到 data 目录中。

注意事项：

- 前端（`webui/src`）改动会自动热重载，无需手动刷新。
- 后端 Go 代码改动需要重启 `go run .` 进程（后端不支持热重载）。
- 修改 `proto/` 下的 protobuf 定义后，需要重新生成共享绑定代码（前端和后端都依赖 `gen/`）：

```sh
buf generate
```

> [!NOTE]
> 下文的 Nix + direnv 方式以及 VSCode Dev Container 都要求启用 Nix flakes。如果你的环境未启用 flakes，请手动安装工具链（参见 [Manual Setup](#manual-setup)），并直接使用上面的命令进行开发。

## Using VSCode Dev Containers

The dev container uses Nix and direnv to provide all dependencies. When the container starts, `direnv allow` runs automatically so the Nix shell is activated in every terminal.

0. Make sure Docker and VSCode with the [Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) extension is installed
1. Clone this repository
2. Open this folder in VSCode
3. When prompted, click on `Open in Container` button, or run `> Dev Containers: Rebuild and Reopen in Containers` command
4. When the container is started, go to `Run and Debug`, choose `Debug Backrest (backend+frontend)` and run it

> [!NOTE]
> Provided launch configuration has hot reload for the typescript frontend.

## Translations

Translations are stored in [./webui/messages](./webui/messages) and are generated using [inlang](https://inlang.com/). Machine translations can be updated by running `npx @inlang/cli machine translate --project ./project.inlang`. 

Text is translated on a best-effort basis and is not guaranteed to be accurate. If you find any translations that are incorrect, please submit a pull request to fix them. Contributions here are greatly appreciated!
