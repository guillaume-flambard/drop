#!/bin/sh
# drop-node on the lab: creates the identity on first start, then serves. A node the relay does not allow yet keeps
# reconnecting with backoff instead of crashing, so the deploy's 15 s check passes before `relay allow`.
set -eu
: "${DROP_HOME:=/var/lib/drop}"
: "${DROP_NAME:=lab}"
: "${DROP_RELAY_URL:=ws://drop-relay:7780/v1}"
export DROP_HOME
if [ ! -f "$DROP_HOME/identity.json" ]; then
  node packages/node/src/cli.ts init --name "$DROP_NAME" --kind machine --relay "$DROP_RELAY_URL"
fi
exec node packages/node/src/cli.ts serve
