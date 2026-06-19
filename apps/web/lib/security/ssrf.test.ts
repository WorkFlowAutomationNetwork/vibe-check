import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:dns', () => ({ default: { lookup: vi.fn() } }))
import dns from 'node:dns'
import { isPrivateIp, assertSafeHostname, validatingLookup, SsrfError } from './ssrf'

describe('isPrivateIp', () => {
  it.each([
    '10.0.0.1', '127.0.0.1', '169.254.169.254', '192.168.1.1', '172.16.0.1',
    '100.64.0.1', '0.0.0.0', '255.255.255.255',
    '::1', 'fc00::1', 'fe80::1', 'ff02::1', '2001:db8::1', '::ffff:127.0.0.1',
  ])('blocks %s', (ip) => {
    expect(isPrivateIp(ip)).toBe(true)
  })

  it.each([
    '8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:2800:220:1::', '::ffff:8.8.8.8',
  ])('allows %s', (ip) => {
    expect(isPrivateIp(ip)).toBe(false)
  })

  it('treats an invalid IP literal as unsafe', () => {
    expect(isPrivateIp('not-an-ip')).toBe(true)
  })
})

describe('assertSafeHostname', () => {
  it.each(['localhost', 'LOCALHOST', 'foo.internal', 'x.local', 'a.localhost',
    'metadata', 'metadata.google.internal', '127.0.0.1', '[::1]', ''])(
    'throws for %s', (host) => {
      expect(() => assertSafeHostname(host)).toThrow(SsrfError)
    })

  it.each(['example.com', 'sub.example.co.uk', '8.8.8.8'])('allows %s', (host) => {
    expect(() => assertSafeHostname(host)).not.toThrow()
  })
})

describe('validatingLookup', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the first address when all resolved IPs are public', () => {
    ;(dns.lookup as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_h: string, _o: unknown, cb: (e: unknown, a: unknown) => void) =>
        cb(null, [{ address: '93.184.216.34', family: 4 }]),
    )
    const cb = vi.fn()
    validatingLookup('example.com', {}, cb)
    expect(cb).toHaveBeenCalledWith(null, '93.184.216.34', 4)
  })

  it('blocks when any resolved IP is private', () => {
    ;(dns.lookup as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_h: string, _o: unknown, cb: (e: unknown, a: unknown) => void) =>
        cb(null, [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.5', family: 4 }]),
    )
    const cb = vi.fn()
    validatingLookup('rebind.test', {}, cb)
    expect(cb).toHaveBeenCalledWith(expect.any(SsrfError))
  })

  it('propagates a DNS error', () => {
    const dnsErr = new Error('ENOTFOUND')
    ;(dns.lookup as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_h: string, _o: unknown, cb: (e: unknown) => void) => cb(dnsErr),
    )
    const cb = vi.fn()
    validatingLookup('missing.test', {}, cb)
    expect(cb).toHaveBeenCalledWith(dnsErr)
  })
})
