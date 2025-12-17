#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TUI_DRIVER_DIR="${TUI_DRIVER_DIR:-$PROJECT_ROOT/../tui-driver}"

cd "$PROJECT_ROOT"

# Only rebuild if --build flag passed or image doesn't exist
if [[ "$1" == "--build" ]] || ! docker image inspect vizzly-tui-tests >/dev/null 2>&1; then
  echo "Building Docker image for TUI tests..."
  docker build -t vizzly-tui-tests -f tests/tui/Dockerfile .
  echo ""
fi

echo "Running TUI tests..."
echo "Make sure 'vizzly tdd start' is running on your host machine"
echo ""

# Mount local directories for rapid iteration:
# - tests/ for test file changes
# - dist/ for client/server code changes
# - src/ for direct source access
# - tui-driver for driver changes
# - .vizzly for baseline storage
# Use host.docker.internal to connect to host's TDD server
docker run --rm \
  --add-host=host.docker.internal:host-gateway \
  -v "$PROJECT_ROOT/tests:/app/tests" \
  -v "$PROJECT_ROOT/dist:/app/dist" \
  -v "$PROJECT_ROOT/src:/app/src" \
  -v "$TUI_DRIVER_DIR:/app/node_modules/tui-driver" \
  -v "$PROJECT_ROOT/.vizzly:/app/.vizzly" \
  -e VIZZLY_SERVER_URL="http://host.docker.internal:47392" \
  -e VIZZLY_LOG_LEVEL="${VIZZLY_LOG_LEVEL:-info}" \
  vizzly-tui-tests \
  npm run test:tui

echo ""
echo "TUI tests complete. Check http://localhost:47392 for results."
