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

function replaceDottedIpv4Tail(ip: string): string | null {
  const lastColonIndex = ip.lastIndexOf(':');
  const tail = ip.slice(lastColonIndex + 1);
  if (!tail.includes('.')) {
    return ip;
  }
  const tailValue = ipv4ToInteger(tail);
  if (tailValue === null) {
    return null;
  }
  const highGroup = (tailValue >>> 16).toString(16);
  const lowGroup = (tailValue & 0xffff).toString(16);
  return `${ip.slice(0, lastColonIndex + 1)}${highGroup}:${lowGroup}`;
}

function ipv6ToBigInt(ip: string): bigint | null {
  const hexadecimalIp = replaceDottedIpv4Tail(ip);
  if (hexadecimalIp === null) {
    return null;
  }
  const groups = expandIpv6Groups(hexadecimalIp);
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

const IPV4_MAPPED_IPV6_MARKER = 0xffffn;

function parseAddress(ip: string): ParsedAddress | null {
  if (ip.includes(':')) {
    const value = ipv6ToBigInt(ip);
    if (value === null) {
      return null;
    }
    return value >> 32n === IPV4_MAPPED_IPV6_MARKER
      ? { value: value & 0xffffffffn, bitWidth: 32 }
      : { value, bitWidth: 128 };
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
  const parts = cidr.split('/');
  if (parts.length !== 2 || !/^\d{1,3}$/.test(parts[1])) {
    return false;
  }
  const [rangeIp, prefixText] = parts;
  const address = parseAddress(ip);
  const range = parseAddress(rangeIp);
  if (address === null || range === null || address.bitWidth !== range.bitWidth) {
    return false;
  }

  const prefix = Number(prefixText);
  if (prefix > range.bitWidth) {
    return false;
  }

  const mask = prefixMask(prefix, range.bitWidth);
  return (address.value & mask) === (range.value & mask);
}
