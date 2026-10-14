// Turns the browser's User-Agent header into a short label like "Chrome on Windows".
// Small hand-written helper (no package). ORDER MATTERS: Edge and Opera also contain "Chrome",
// and Chrome also contains "Safari", so the more specific names are checked first.
const BROWSERS = [
  [/Edg(e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];
const SYSTEMS = [
  [/Windows NT/, 'Windows'],
  [/Android/, 'Android'],
  [/iPhone|iPad|iPod/, 'iOS'],
  [/CrOS/, 'ChromeOS'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/Linux/, 'Linux'],
];

const find = (list, ua) => (list.find(([rx]) => rx.test(ua)) || [])[1];

function parseDevice(ua = '') {
  const browser = find(BROWSERS, ua);
  const os = find(SYSTEMS, ua);
  if (browser && os) return `${browser} on ${os}`;
  if (browser || os) return browser || os;
  // Not a browser (e.g. Postman, curl): show the first word of the header, if any
  return ua ? ua.split(/[\s/]/)[0].slice(0, 40) : 'Unknown device';
}

// "::ffff:127.0.0.1" (IPv4 written as IPv6) -> "127.0.0.1"
const cleanIp = (ip = '') => ip.replace(/^::ffff:/, '');

module.exports = { parseDevice, cleanIp };
