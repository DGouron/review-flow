type ParsedAddress = { value: bigint; bitWidth: 32 | 128 };

const IPV6_GROUP_COUNT = 8;

function ipv4ToInteger(ip: string): number | null {
  const octets = ip.split('.');
  if (octets.length !== 4) {
    return null;
  }

  let value = 0;
  for (const octet of octets) {
    if (!/^\d{1,3}$/.test(octet)) {
      return null;
    }
    const part = Number(octet);
    if (part > 255) {
      return null;
    }
    value = value * 256 + part;
  }
  return value >>> 0;
}

function expandIpv6Groups(ip: string): string[] | null {
  const halves = ip.split('::');
  if (halves.length > 2) {
    return null;
  }

  const head = halves[0] === '' ? [] : halves[0].split(':');
  if (halves.length === 1) {
    return head;
  }

  const tail = halves[1] === '' ? [] : halves[1].split(':');
  const missingGroupCount = IPV6_GROUP_COUNT - head.length - tail.length;
  if (missingGroupCount < 1) {
    return null;
  }
  return [...head, ...Array.from({ length: missingGroupCount }, () => '0'), ...tail];
}

function ipv6ToBigInt(ip: string): bigint | null {
  const groups = expandIpv6Groups(ip);
  if (groups === null || groups.length !== IPV6_GROUP_COUNT) {
    return null;
  }

  let value = 0n;
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(group)) {
      return null;
    }
    value = (value << 16n) | BigInt(Number.parseInt(group, 16));
  }
  return value;
}

function parseAddress(ip: string): ParsedAddress | null {
  if (ip.includes(':')) {
    const value = ipv6ToBigInt(ip);
    return value === null ? null : { value, bitWidth: 128 };
  }
  const value = ipv4ToInteger(ip);
  return value === null ? null : { value: BigInt(value), bitWidth: 32 };
}

function prefixMask(prefix: number, bitWidth: number): bigint {
  const hostBits = BigInt(bitWidth - prefix);
  const allBits = (1n << BigInt(bitWidth)) - 1n;
  return (allBits >> hostBits) << hostBits;
}

/**
 * True when `ip` belongs to `cidr`. Supports IPv4 and IPv6; an address never
 * matches a range of the other family.
 */
export function isIpInCidr(ip: string, cidr: string): boolean {
  const [rangeIp, prefixText] = cidr.split('/');
  const address = parseAddress(ip);
  const range = parseAddress(rangeIp);
  if (address === null || range === null || address.bitWidth !== range.bitWidth) {
    return false;
  }

  const prefix = Number(prefixText);
  if (prefixText === '' || !Number.isInteger(prefix) || prefix < 0 || prefix > range.bitWidth) {
    return false;
  }

  const mask = prefixMask(prefix, range.bitWidth);
  return (address.value & mask) === (range.value & mask);
}
