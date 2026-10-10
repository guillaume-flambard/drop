#!/bin/sh
set -eu
umask 077
mkdir -p /evidence
# Capture packet metadata only: no payload, no local token, no source content.
tcpdump --immediate-mode -B 16384 -s 96 -i any -nn -l -q 'tcp or udp' > /evidence/network.txt 2>/evidence/capture.txt &
capture_pid=$!
trap 'kill -INT "$capture_pid" 2>/dev/null || true; wait "$capture_pid" 2>/dev/null || true' EXIT
sleep 1
ip -j address > /evidence/interfaces.json
ip -j route > /evidence/routes.json
node --input-type=module -e '
import { connect } from "node:net";
const socket = connect({ host: "192.0.2.1", port: 443 });
socket.once("connect", () => { console.error("UNEXPECTED_EGRESS"); process.exit(1); });
socket.once("error", (error) => { console.log(JSON.stringify({ egressProbe: error.code })); });
socket.setTimeout(2000, () => { console.error("AMBIGUOUS_EGRESS"); process.exit(1); });
' > /evidence/egress.json
node proof.mjs --private-proof > /evidence/result.json
sleep 1
kill -INT "$capture_pid"
wait "$capture_pid"
trap - EXIT
