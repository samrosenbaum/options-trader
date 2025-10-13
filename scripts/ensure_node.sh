#!/bin/sh
set -eu

ensure_node() {
  if command -v npm >/dev/null 2>&1; then
    # npm already available in PATH
    return 0
  fi

  script_dir=$(cd "$(dirname "$0")" && pwd)
  repo_root=$(cd "$script_dir/.." && pwd)
  node_dir=${NODE_DIR:-$repo_root/.node}
  node_version=${NODE_VERSION:-20.17.0}

  echo "npm not found; installing Node.js ${node_version} locally..."

  arch=$(uname -m)
  case "$arch" in
    x86_64|amd64)
      node_arch="x64"
      ;;
    arm64|aarch64)
      node_arch="arm64"
      ;;
    *)
      echo "Unsupported architecture: $arch" >&2
      return 1
      ;;
  esac

  if [ ! -x "${node_dir}/bin/npm" ]; then
    rm -rf "${node_dir}"
    mkdir -p "${node_dir}"
    tmp_tar=$(mktemp)
    node_url="https://nodejs.org/dist/v${node_version}/node-v${node_version}-linux-${node_arch}.tar.xz"
    echo "Downloading Node.js from ${node_url}..."
    curl -fsSL "$node_url" -o "$tmp_tar"
    tar -xJf "$tmp_tar" -C "$node_dir" --strip-components=1
    rm -f "$tmp_tar"
  fi

  PATH="${node_dir}/bin:${PATH}"
  export PATH
  hash -r 2>/dev/null || true

  if ! command -v npm >/dev/null 2>&1; then
    echo "Failed to install npm" >&2
    return 1
  fi

  echo "Node.js installation complete: $(node --version) / npm $(npm --version)"
}

ensure_node
