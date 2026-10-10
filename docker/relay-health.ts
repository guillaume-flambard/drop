// Container health check of the enterprise relay (T4.10). RELAY_HEALTH_URL defaults to the plain relay port; for a
// relay that serves TLS itself, set it to https://127.0.0.1:8443/health: on loopback the certificate is not checked,
// since only liveness is asked here.
import { get as getHttp } from 'node:http';
import { get as getHttps } from 'node:https';

const url = new URL(process.env.RELAY_HEALTH_URL ?? 'http://127.0.0.1:7780/health');
const get = url.protocol === 'https:' ? getHttps : getHttp;
const request = get(url, { rejectUnauthorized: url.hostname !== '127.0.0.1', timeout: 4000 }, (res) => {
  res.resume();
  process.exit(res.statusCode === 200 ? 0 : 1);
});
request.on('error', () => process.exit(1));
request.on('timeout', () => {
  request.destroy();
  process.exit(1);
});
