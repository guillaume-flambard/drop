"""Validate metadata-only network evidence after the isolated process has exited."""
import json
from pathlib import Path
import re

root = Path('/evidence')
trace = (root / 'connect.txt').read_text()
capture = (root / 'capture.txt').read_text()
packets = [line for line in (root / 'network.txt').read_text().splitlines() if line.strip()]
ipv4 = sorted(set(re.findall(r'inet_addr\("([^"]+)"\)', trace)))
assert ipv4 == ['127.0.0.1'], ipv4
assert 'AF_INET6' not in trace, 'Unexpected IPv6 connect'
assert packets and all(' lo ' in line and ' IP 127.0.0.1.' in line
                       and ' > 127.0.0.1.' in line for line in packets)
assert '0 packets dropped by kernel' in capture, capture
assert json.loads((root / 'routes.json').read_text()) == []
result = json.loads((root / 'result.json').read_text())
assert len(result['scenarios']) == 6
result['network'] = {'ipv4_connect_destinations': ipv4, 'packet_lines': len(packets),
                     'kernel_drops': 0, 'routes': [], 'isolation': 'docker --network none'}
result['status'] = 'PASS'
(root / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
print('PASS: upstream Hermes MCP, agent loop, model failure and loopback-only network evidence')
