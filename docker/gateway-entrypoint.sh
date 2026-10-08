#!/bin/sh
# drop-gateway on the lab (T2.13): creates its identity on first start (printed in the logs, to allow on the relay),
# then serves OAuth and /mcp for ChatGPT and Claude. Until the relay allows it, it keeps reconnecting with backoff.
set -eu
: "${GATEWAY_HOME:=/var/lib/drop-gateway}"
export GATEWAY_HOME
if [ ! -f "$GATEWAY_HOME/identity.json" ]; then
  node packages/gateway/src/cli.ts init
fi
exec node packages/gateway/src/cli.ts serve
