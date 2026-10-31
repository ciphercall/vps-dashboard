export function isPrivateIp(ip: unknown): boolean {
  if (ip === null || ip === undefined) return false;
  const s = String(ip).trim();
  if (!s) return false;
  if (s.toLowerCase() === 'localhost') return true;

  // Strip IPv6 brackets if present.
  const cleaned = s.replace(/^\[/, '').replace(/\]$/, '');
  const lower = cleaned.toLowerCase();

  // IPv4
  const v4 = cleaned.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const octets = v4.slice(1).map((x) => Number(x));
    if (octets.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;
    const [a, b] = octets;
    if (a === 0 && octets[1] === 0 && octets[2] === 0 && octets[3] === 0) return true; // 0.0.0.0
    if (a === 127) return true; // loopback
    if (a === 10) return true; // 10/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
    if (a === 192 && b === 168) return true; // 192.168/16
    if (a === 169 && b === 254) return true; // link-local
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
    return false;
  }

  // IPv6
  if (lower === '::1') return true;

  // Determine first hextet for prefix ranges.
  const firstGroup = lower.split(':')[0];
  if (firstGroup) {
    const val = parseInt(firstGroup, 16);
    if (!Number.isNaN(val)) {
      // ULA fc00::/7
      if (val >= 0xfc00 && val <= 0xfdff) return true;
      // link-local fe80::/10
      if (val >= 0xfe80 && val <= 0xfebf) return true;
    }
  }

  return false;
}

export function firstForwardedIp(xff: unknown): string | null {
  if (xff === null || xff === undefined) return null;
  const s = String(xff).trim();
  if (!s || s === '-') return null;
  const first = s.split(',')[0].trim();
  if (!first || first === '-') return null;
  return first;
}