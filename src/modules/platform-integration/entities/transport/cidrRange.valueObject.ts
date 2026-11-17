type IpAddress = { value: bigint; bitWidth: 32 | 128 };

const IPV6_GROUP_COUNT = 8;
const IPV4_MAPPED_IPV6_MARKER = 0xffffn;
const IPV4_MAPPED_IPV6_PREFIX_LENGTH = 96;

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

function parseIpAddress(ip: string): IpAddress | null {
  if (ip.includes(':')) {
    const value = ipv6ToBigInt(ip);
    return value === null ? null : { value, bitWidth: 128 };
  }
  const value = ipv4ToInteger(ip);
  return value === null ? null : { value: BigInt(value), bitWidth: 32 };
}

function isIpv4Mapped(address: IpAddress): boolean {
  return address.bitWidth === 128 && address.value >> 32n === IPV4_MAPPED_IPV6_MARKER;
}

function unmapIpv4(address: IpAddress): IpAddress {
  return isIpv4Mapped(address) ? { value: address.value & 0xffffffffn, bitWidth: 32 } : address;
}

function prefixMask(prefixLength: number, bitWidth: number): bigint {
  const hostBits = BigInt(bitWidth - prefixLength);
  const allBits = (1n << BigInt(bitWidth)) - 1n;
  return (allBits >> hostBits) << hostBits;
}

/**
 * An IPv4 or IPv6 CIDR range, parsed strictly once. IPv4-mapped IPv6
 * addresses (`::ffff:a.b.c.d`) are compared as IPv4.
 */
export class CidrRange {
  private constructor(
    private readonly text: string,
    private readonly network: IpAddress,
    readonly prefixLength: number,
  ) {}

  static parse(text: string): CidrRange | null {
    const parts = text.split('/');
    if (parts.length !== 2 || !/^\d{1,3}$/.test(parts[1])) {
      return null;
    }
    const network = parseIpAddress(parts[0]);
    const prefixLength = Number(parts[1]);
    if (network === null || prefixLength > network.bitWidth) {
      return null;
    }
    if (isIpv4Mapped(network) && prefixLength >= IPV4_MAPPED_IPV6_PREFIX_LENGTH) {
      return new CidrRange(text, unmapIpv4(network), prefixLength - IPV4_MAPPED_IPV6_PREFIX_LENGTH);
    }
    return new CidrRange(text, network, prefixLength);
  }

  get bitWidth(): 32 | 128 {
    return this.network.bitWidth;
  }

  contains(ip: string): boolean {
    const parsed = parseIpAddress(ip);
    if (parsed === null) {
      return false;
    }
    const address = unmapIpv4(parsed);
    if (address.bitWidth !== this.network.bitWidth) {
      return false;
    }
    const mask = prefixMask(this.prefixLength, this.network.bitWidth);
    return (address.value & mask) === (this.network.value & mask);
  }

  toString(): string {
    return this.text;
  }
}
