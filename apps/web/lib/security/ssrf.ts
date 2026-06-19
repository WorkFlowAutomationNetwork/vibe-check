import net, { type LookupFunction } from 'node:net'
import dns from 'node:dns'
import { Agent, fetch as undiciFetch } from 'undici'

export class SsrfError extends Error {}

const BLOCKED_NAMES = new Set(['localhost', 'metadata', 'metadata.google.internal'])

function ipv4ToInt(ip: string): number {
  const p = ip.split('.').map(Number)
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3]
}

const V4_BLOCKS: Array<[string, number]> = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4], ['255.255.255.255', 32],
]

function isPrivateIpv4(ip: string): boolean {
  const v = ipv4ToInt(ip)
  return V4_BLOCKS.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
    return (v & mask) === (ipv4ToInt(base) & mask)
  })
}

function ipv6ToBytes(ip: string): number[] | null {
  let addr = ip.toLowerCase()
  const pct = addr.indexOf('%')
  if (pct !== -1) addr = addr.slice(0, pct)

  // Convert a trailing embedded IPv4 (e.g. ::ffff:127.0.0.1) into two hextets.
  const lastColon = addr.lastIndexOf(':')
  const tail = lastColon === -1 ? '' : addr.slice(lastColon + 1)
  if (tail.includes('.')) {
    if (!net.isIPv4(tail)) return null
    const o = tail.split('.').map(Number)
    const hi = ((o[0] << 8) | o[1]).toString(16)
    const lo = ((o[2] << 8) | o[3]).toString(16)
    addr = addr.slice(0, lastColon + 1) + hi + ':' + lo
  }

  const halves = addr.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const tailH = halves.length === 2 ? (halves[1] ? halves[1].split(':') : []) : []
  let hextets: string[]
  if (halves.length === 2) {
    const missing = 8 - head.length - tailH.length
    if (missing < 1) return null
    hextets = [...head, ...Array(missing).fill('0'), ...tailH]
  } else {
    hextets = head
  }
  if (hextets.length !== 8) return null

  const bytes: number[] = []
  for (const h of hextets) {
    if (!/^[0-9a-f]{1,4}$/.test(h)) return null
    const v = parseInt(h, 16)
    bytes.push((v >> 8) & 0xff, v & 0xff)
  }
  return bytes
}

function isPrivateIpv6(ip: string): boolean {
  const b = ipv6ToBytes(ip)
  if (!b) return true
  const mapped = b.slice(0, 10).every(x => x === 0) && b[10] === 0xff && b[11] === 0xff
  if (mapped) return isPrivateIpv4(`${b[12]}.${b[13]}.${b[14]}.${b[15]}`)
  if (b.every(x => x === 0)) return true                            // ::
  if (b.slice(0, 15).every(x => x === 0) && b[15] === 1) return true // ::1
  if ((b[0] & 0xfe) === 0xfc) return true                          // fc00::/7
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return true         // fe80::/10
  if (b[0] === 0xff) return true                                    // ff00::/8
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x0d && b[3] === 0xb8) return true // 2001:db8::/32
  return false
}

export function isPrivateIp(ip: string): boolean {
  const kind = net.isIP(ip)
  if (kind === 4) return isPrivateIpv4(ip)
  if (kind === 6) return isPrivateIpv6(ip)
  return true // not a valid IP literal → unsafe
}

export function assertSafeHostname(hostname: string): void {
  const h = hostname.replace(/^\[/, '').replace(/\]$/, '').toLowerCase().replace(/\.$/, '')
  if (!h) throw new SsrfError('empty host')
  if (
    BLOCKED_NAMES.has(h) ||
    h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')
  ) {
    throw new SsrfError(`blocked hostname: ${h}`)
  }
  if (net.isIP(h) && isPrivateIp(h)) {
    throw new SsrfError(`blocked address: ${h}`)
  }
}

type LookupCb = (err: NodeJS.ErrnoException | null, address?: string, family?: number) => void

export function validatingLookup(hostname: string, _options: unknown, callback: LookupCb): void {
  dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) return callback(err)
    const blocked = addresses.find(a => isPrivateIp(a.address))
    if (blocked) {
      return callback(new SsrfError(`blocked address: ${blocked.address}`) as NodeJS.ErrnoException)
    }
    const first = addresses[0]
    if (!first) return callback(new SsrfError('no addresses') as NodeJS.ErrnoException)
    callback(null, first.address, first.family)
  })
}

const ssrfAgent = new Agent({ connect: { lookup: validatingLookup as unknown as LookupFunction } })

export function safeFetch(url: string, init?: Parameters<typeof undiciFetch>[1]) {
  const { hostname } = new URL(url)
  assertSafeHostname(hostname)
  return undiciFetch(url, { ...init, dispatcher: ssrfAgent })
}
