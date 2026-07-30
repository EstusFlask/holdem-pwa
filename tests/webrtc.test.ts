import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  GuestPeerRoom,
  HostPeerRoom,
  decodePairingSignal,
  encodePairingSignal,
  type PairingSignal,
} from '../src/services/webrtc'

class FakeDataChannel extends EventTarget {
  readyState: RTCDataChannelState = 'connecting'
  sent: string[] = []

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {
    if (this.readyState === 'closed') return
    this.readyState = 'closed'
    this.dispatchEvent(new Event('close'))
  }

  open(): void {
    this.readyState = 'open'
    this.dispatchEvent(new Event('open'))
  }

  receive(payload: unknown): void {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(payload) }))
  }
}

class FakePeerConnection extends EventTarget {
  static instances: FakePeerConnection[] = []

  iceGatheringState: RTCIceGatheringState = 'gathering'
  connectionState: RTCPeerConnectionState = 'new'
  localDescription: RTCSessionDescription | null = null
  remoteDescription: RTCSessionDescription | null = null
  readonly channel = new FakeDataChannel()
  closed = false

  constructor() {
    super()
    FakePeerConnection.instances.push(this)
  }

  createDataChannel(): RTCDataChannel {
    return this.channel as unknown as RTCDataChannel
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    return { type: 'offer', sdp: 'v=0\r\n' }
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return { type: 'answer', sdp: 'v=0\r\n' }
  }

  async setLocalDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.setLocal(description)
  }

  async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescription = this.description(description)
  }

  close(): void {
    this.closed = true
    this.connectionState = 'closed'
  }

  completeIce(): void {
    if (!this.localDescription) throw new Error('Local description has not been set')
    this.setLocal({
      type: this.localDescription.type,
      sdp: `${this.localDescription.sdp}a=candidate:1 1 UDP 2122260223 192.168.1.20 50000 typ host\r\n`,
    })
    this.iceGatheringState = 'complete'
    this.dispatchEvent(new Event('icegatheringstatechange'))
  }

  private setLocal(description: RTCSessionDescriptionInit): void {
    this.localDescription = this.description(description)
  }

  private description(description: RTCSessionDescriptionInit): RTCSessionDescription {
    const value = { type: description.type!, sdp: description.sdp ?? '' }
    return {
      ...value,
      toJSON: () => ({ ...value }),
    } as RTCSessionDescription
  }
}

const profile = { id: 'PLAYER234', name: 'Alice', avatar: '' }
let rooms: Array<HostPeerRoom | GuestPeerRoom> = []

function answerFor(offerCode: string): string {
  const offer = decodePairingSignal(offerCode)
  return encodePairingSignal({
    version: 1,
    type: 'answer',
    sessionId: offer.sessionId,
    description: {
      type: 'answer',
      sdp: 'v=0\r\na=candidate:2 1 UDP 2122260223 192.168.1.21 50001 typ host\r\n',
    },
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('window', globalThis)
  vi.stubGlobal('RTCPeerConnection', FakePeerConnection)
  FakePeerConnection.instances = []
  rooms = []
})

afterEach(() => {
  for (const room of rooms) room.close()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('WebRTC QR lifecycle', () => {
  it('waits for complete ICE before publishing the host offer', async () => {
    const room = new HostPeerRoom(profile, { roomName: 'Test room' })
    rooms.push(room)

    let settled = false
    const invite = room.createInvite().then((code) => {
      settled = true
      return code
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    FakePeerConnection.instances[0].completeIce()
    const signal = decodePairingSignal(await invite)
    expect(signal.description.sdp).toContain('a=candidate:')
  })

  it('rejects and closes an offer whose ICE gathering times out', async () => {
    const room = new HostPeerRoom(profile, { roomName: 'Test room' })
    rooms.push(room)
    const invite = room.createInvite()
    await Promise.resolve()

    const failure = expect(invite).rejects.toThrow('未能收集完整')
    await vi.advanceTimersByTimeAsync(15_000)
    await failure
    expect(FakePeerConnection.instances[0].closed).toBe(true)
  })

  it('waits for complete ICE before publishing the guest answer', async () => {
    const offer: PairingSignal = {
      version: 1,
      type: 'offer',
      sessionId: 'ABC234XYZ7',
      description: {
        type: 'offer',
        sdp: 'v=0\r\na=candidate:1 1 UDP 2122260223 192.168.1.20 50000 typ host\r\n',
      },
      room: { code: 'ABC234', name: 'Test room', host: 'Host' },
    }
    const room = new GuestPeerRoom(profile)
    rooms.push(room)
    const answer = room.acceptOffer(encodePairingSignal(offer))
    await vi.waitFor(() => {
      expect(FakePeerConnection.instances[0].localDescription).not.toBeNull()
    })

    FakePeerConnection.instances[0].completeIce()
    expect(decodePairingSignal((await answer).answer).description.sdp).toContain('a=candidate:')
  })

  it('finishes host acceptance only after the guest joins', async () => {
    const room = new HostPeerRoom(profile, { roomName: 'Test room' })
    rooms.push(room)
    const invite = room.createInvite()
    await Promise.resolve()
    const connection = FakePeerConnection.instances[0]
    connection.completeIce()
    const offerCode = await invite

    let settled = false
    const accepted = room.acceptAnswer(answerFor(offerCode)).then((name) => {
      settled = true
      return name
    })
    await Promise.resolve()
    connection.channel.open()
    await Promise.resolve()
    expect(settled).toBe(false)

    connection.channel.receive({ type: 'join', profile: { id: 'BOB234', name: 'Bob', avatar: '' } })
    await expect(accepted).resolves.toBe('Bob')
  })

  it('times out an answered session that never joins', async () => {
    const room = new HostPeerRoom(profile, { roomName: 'Test room' })
    rooms.push(room)
    const invite = room.createInvite()
    await Promise.resolve()
    const connection = FakePeerConnection.instances[0]
    connection.completeIce()
    const accepted = room.acceptAnswer(answerFor(await invite))
    await Promise.resolve()

    const failure = expect(accepted).rejects.toThrow('连接超时')
    await vi.advanceTimersByTimeAsync(20_000)
    await failure
    expect(connection.closed).toBe(true)
  })
})
