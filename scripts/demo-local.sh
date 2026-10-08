#!/usr/bin/env bash
# Local end-to-end demo with real processes: a relay, a "VPS" node that executes production.error_summary on a
# fixture log, and a "Guillaume" node that requests through the MCP server and approves. Everything on 127.0.0.1.
# Usage: scripts/demo-local.sh [workdir]   (default: a new temp dir; nothing outside it is touched)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${1:-$(mktemp -d -t drop-demo)}"
DROP="node $ROOT/packages/node/src/cli.ts"
RELAY="node $ROOT/packages/relay/src/cli.ts"
PROBE="node $ROOT/packages/requester-mcp/scripts/probe.ts"
PIDS=()
cleanup() { for pid in "${PIDS[@]:-}"; do kill "$pid" 2>/dev/null || true; done; }
trap cleanup EXIT
step() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

step "Work dir: $WORK"
mkdir -p "$WORK"
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cat > "$WORK/app.log" <<LOG
$NOW INFO checkout ok user=alice@example.com amount=42.00EUR
$NOW ERROR payment timeout order=9f1c2b7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f card=4242
$NOW ERROR payment timeout order=1b2c3d4e-0000-4c3d-8e9f-0a1b2c3d4e5f ip=10.0.0.7
$NOW ERROR db connection refused host=db.internal key=sk-ant-api03-notarealkeybutlookslikeone
$NOW FATAL unexpected crash in worker token=abcd
LOG
cat > "$WORK/error-summary.json" <<CFG
{ "services": { "api": { "source": { "kind": "file", "path": "$WORK/app.log" } } },
  "errorPatterns": [ { "name": "PAYMENT_TIMEOUT", "regex": "payment timeout" }, { "name": "DB_DOWN", "regex": "connection refused" } ],
  "errorLineRegex": "\\\\b(ERROR|FATAL)\\\\b", "degradedThreshold": 2 }
CFG

step "Init two nodes"
DROP_HOME="$WORK/vps" $DROP init --name VPS --kind machine --relay ws://127.0.0.1:7790/v1 --port 7791
DROP_HOME="$WORK/mac" $DROP init --name Guillaume --kind human --relay ws://127.0.0.1:7790/v1 --port 7792
VPS_ID="$(node -e "console.log(JSON.parse(require('fs').readFileSync('$WORK/vps/identity.json','utf8')).nodeId)")"
MAC_ID="$(node -e "console.log(JSON.parse(require('fs').readFileSync('$WORK/mac/identity.json','utf8')).nodeId)")"

step "Relay allowing both nodes"
printf '{ "port": 7790, "allowedNodeIds": ["%s", "%s"] }\n' "$VPS_ID" "$MAC_ID" > "$WORK/relay.config.json"
$RELAY serve --config="$WORK/relay.config.json" > "$WORK/relay.log" 2>&1 & PIDS+=($!)
sleep 1

step "VPS publishes production.error_summary, approved by Guillaume"
DROP_HOME="$WORK/vps" $DROP publish production.error_summary --approver "$MAC_ID" --config "$WORK/error-summary.json"

step "Start both daemons"
DROP_HOME="$WORK/vps" $DROP serve > "$WORK/vps.log" 2>&1 & PIDS+=($!)
DROP_HOME="$WORK/mac" $DROP serve > "$WORK/mac.log" 2>&1 & PIDS+=($!)
sleep 2

step "Pairing: the VPS invites, Guillaume pairs"
CODE="$(DROP_HOME="$WORK/vps" $DROP invite | head -1)"
DROP_HOME="$WORK/mac" $DROP pair "$CODE"
sleep 1
DROP_HOME="$WORK/mac" $DROP peers

step "Agent side (MCP): list_capabilities"
DROP_HOME="$WORK/mac" $PROBE list

step "Agent side (MCP): invalid input is refused locally"
DROP_HOME="$WORK/mac" $PROBE request '{"capability_id":"production.error_summary","input":{"service":"api","window":"3d"},"purpose":"Comprendre les erreurs de paiement"}' || true

step "Agent side (MCP): request_drop"
OUT="$(DROP_HOME="$WORK/mac" $PROBE request '{"capability_id":"production.error_summary","input":{"service":"api","window":"1h"},"purpose":"Comprendre les erreurs de paiement de ce matin"}')"
echo "$OUT"
DROP_ID="$(echo "$OUT" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).drop_id))")"
sleep 1

step "Owner side: pending request (also visible in the consent UI, see $WORK/mac.log)"
DROP_HOME="$WORK/mac" $DROP pending

step "Owner approves once"
DROP_HOME="$WORK/mac" $DROP approve "$DROP_ID"

step "Agent side (MCP): get_drop_result"
DROP_HOME="$WORK/mac" $PROBE result "$DROP_ID"

step "Receipts (hashes only)"
sleep 1
DROP_HOME="$WORK/vps" $DROP receipts
DROP_HOME="$WORK/mac" $DROP receipts

step "Leak check: no log fragment in what the requester received"
if grep -R -E "alice@example|sk-ant-|9f1c2b7e|10\.0\.0\.7|42\.00" "$WORK/mac" >/dev/null 2>&1; then echo "LEAK FOUND"; exit 1; else echo "no leak"; fi
