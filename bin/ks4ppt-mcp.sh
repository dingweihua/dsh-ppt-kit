#!/usr/bin/env bash
# Portable launcher for the KitchenSink4PPT MCP server (stdio).
#
# Use this when the plain `uvx kitchensink4ppt` command does not start:
#   - the host is sandboxed and ~/.local/share/uv is not writable
#   - the GUI-launched app has a PATH that lacks uv / soffice
#
# Override any of the three UV_* variables before calling; defaults land in
# ~/.dsh-ppt-kit so nothing writes outside your home directory.
set -euo pipefail

: "${UV_TOOL_DIR:=$HOME/.dsh-ppt-kit/uv/tools}"
: "${UV_TOOL_BIN_DIR:=$HOME/.dsh-ppt-kit/uv/bin}"
: "${UV_CACHE_DIR:=$HOME/.dsh-ppt-kit/uv/cache}"
export UV_TOOL_DIR UV_TOOL_BIN_DIR UV_CACHE_DIR

# Home may be read-only (DSH file sandbox, locked-down corporate machines).
# Fall back to the OS temp dir rather than failing to start.
ensure_writable() {
  local dir="$1"
  mkdir -p "$dir" 2>/dev/null && return 0
  return 1
}
if ! ensure_writable "$UV_TOOL_DIR"; then
  base="${TMPDIR:-/tmp}/dsh-ppt-kit"
  echo "ks4ppt-mcp: $UV_TOOL_DIR not writable, falling back to $base" >&2
  UV_TOOL_DIR="$base/tools" UV_TOOL_BIN_DIR="$base/bin" UV_CACHE_DIR="$base/cache"
  export UV_TOOL_DIR UV_TOOL_BIN_DIR UV_CACHE_DIR
  mkdir -p "$UV_TOOL_DIR" "$UV_TOOL_BIN_DIR" "$UV_CACHE_DIR"
fi

# LibreOffice has no well-known path on macOS; the server probes KS4P_SOFFICE,
# then `which soffice`. Only needed for PDF / slide-image export.
if [ -z "${KS4P_SOFFICE:-}" ]; then
  for candidate in \
      "/Applications/LibreOffice.app/Contents/MacOS/soffice" \
      "$(command -v soffice || true)"; do
    if [ -n "$candidate" ] && [ -x "$candidate" ]; then
      export KS4P_SOFFICE="$candidate"
      break
    fi
  done
fi

# uv may live outside the PATH a GUI-launched app inherits.
if ! command -v uvx >/dev/null 2>&1; then
  for candidate in "$HOME/.local/bin/uvx" /opt/homebrew/bin/uvx /usr/local/bin/uvx; do
    [ -x "$candidate" ] && PATH="$(dirname "$candidate"):$PATH" && break
  done
  export PATH
fi

exec uvx --quiet kitchensink4ppt "$@"
