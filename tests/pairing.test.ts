import { describe, expect, it } from 'vitest'
import { decodePairingSignal, encodePairingSignal, type PairingSignal } from '../src/services/webrtc'

const signal: PairingSignal = {
  version: 1,
  type: 'offer',
  sessionId: 'ABC234XYZ7',
  description: {
    type: 'offer',
    sdp: `v=0\r\n${'a=candidate:123 1 udp 2122260223 192.168.1.8 50000 typ host\r\n'.repeat(8)}`,
  },
  room: { code: '8K2F7M', name: '周五牌局', host: 'Alice' },
}

describe('offline QR pairing signal', () => {
  it('round-trips a compressed WebRTC offer', () => {
    const encoded = encodePairingSignal(signal)
    expect(encoded.startsWith('GH1.')).toBe(true)
    expect(encoded.length).toBeLessThan(JSON.stringify(signal).length)
    expect(decodePairingSignal(encoded)).toEqual(signal)
  })

  it('rejects unrelated or damaged codes', () => {
    expect(() => decodePairingSignal('https://example.com')).toThrow('不是 Glass Hold’em')
    expect(() => decodePairingSignal('GH1.broken')).toThrow('损坏')
  })
})
