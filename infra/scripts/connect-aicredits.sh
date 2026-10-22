#!/usr/bin/env bash
# Connects a local Vellum assistant to AICredits (OpenAI-compatible) and makes it the chat model.
# Reads AICREDITS_API_KEY (and optional AICREDITS_BASE_URL, AICREDITS_MODEL) from the repo's .env.
# Run it from your own terminal, not from inside the assistant. The key goes straight from .env
# into Vellum's credential store and is never printed.
#
#   infra/scripts/connect-aicredits.sh [assistant-name]      # default: chintu
#
# Steps: store the key, add an "aicredits" provider, add a "bunty-luna" profile, send one
# test message, then make that profile the active chat model.
set -euo pipefail

ASSISTANT="${1:-chintu}"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export PATH="$HOME/.bun/bin:$PATH"
export VELLUM_WORKSPACE_DIR="${VELLUM_WORKSPACE_DIR:-$HOME/.local/share/vellum/assistants/$ASSISTANT/.vellum/workspace}"

env_value() { grep -E "^$1=" "$REPO_ROOT/.env" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true; }

KEY="$(env_value AICREDITS_API_KEY)"
BASE_URL="$(env_value AICREDITS_BASE_URL)"; BASE_URL="${BASE_URL:-https://api.aicredits.in/v1}"
MODEL="$(env_value AICREDITS_MODEL)"; MODEL="${MODEL:-openai/gpt-6-luna}"
PROFILE="bunty-luna"

[ -n "$KEY" ] || { echo "AICREDITS_API_KEY is empty in $REPO_ROOT/.env" >&2; exit 1; }
[ -S "$VELLUM_WORKSPACE_DIR/assistant.sock" ] || { echo "Assistant '$ASSISTANT' is not running. Start it with: vellum wake $ASSISTANT" >&2; exit 1; }

echo "==> Storing the key in $ASSISTANT's credential store (aicredits/api_key)"
assistant credentials set --service aicredits --field api_key \
  --label "AICredits" --description "OpenAI-compatible model gateway (aicredits.in)" "$KEY" > /dev/null

echo "==> Adding provider 'aicredits' ($BASE_URL, $MODEL)"
if assistant inference providers get aicredits > /dev/null 2>&1; then
  assistant inference providers update aicredits --base-url "$BASE_URL" --model "$MODEL" \
    --credential credential/aicredits/api_key
else
  assistant inference providers create aicredits --provider openai-compatible --base-url "$BASE_URL" \
    --model "$MODEL" --credential credential/aicredits/api_key
fi

echo "==> Adding profile '$PROFILE'"
if assistant inference profiles get "$PROFILE" > /dev/null 2>&1; then
  assistant inference profiles update "$PROFILE" --provider openai-compatible --model "$MODEL" --connection aicredits
else
  assistant inference profiles create "$PROFILE" --provider openai-compatible --model "$MODEL" \
    --connection aicredits --label "Bunty (AICredits, $MODEL)" --allow-unlisted
fi

echo "==> Test message through the profile"
assistant inference send --profile "$PROFILE" "Reply with exactly: OK"

echo "==> Making '$PROFILE' the active chat model"
assistant inference profiles active "$PROFILE"
echo "Done. Chat with: vellum client $ASSISTANT"
