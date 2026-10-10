#!/bin/sh
set -eu
umask 077
mkdir -p /evidence
rm -f /evidence/result.json
tcpdump --immediate-mode -B 16384 -s 96 -i any -nn -l -q 'tcp or udp' > /evidence/network.txt 2>/evidence/capture.txt &
capture_pid=$!
trap 'kill -INT "$capture_pid" 2>/dev/null || true; wait "$capture_pid" 2>/dev/null || true' EXIT
sleep 1
ip -j address > /evidence/interfaces.json
ip -j route > /evidence/routes.json
pip freeze > /evidence/python-dependencies.txt
timeout 120 strace -f -e trace=connect -s 128 -o /evidence/connect.txt python /proof/evaluate.py
sleep 1
kill -INT "$capture_pid"
wait "$capture_pid"
trap - EXIT
python /proof/verify.py
