import { describe, it, expect } from 'vitest'
import { loadRegisterMap } from '../src/registerMap'
import { join } from 'path'
import { MqttPublisher } from '../src/mqttPublisher'

class FakeClient {
  public last: { topic?: string; payload?: string; opts?: any } = {}
  publish(topic: string, payload: string | Buffer, opts: any, cb?: (err?: any) => void) {
    this.last = { topic, payload: typeof payload === 'string' ? payload : payload.toString(), opts }
    if (cb) cb()
  }
}

describe('MqttPublisher', () => {
  it('parses uint16 and publishes scaled value', async () => {
    const file = join(process.cwd(), 'config', 'register-map.yaml')
    const rm = await loadRegisterMap(file)
    const fake = new FakeClient() as any
    const pub = new MqttPublisher(fake, rm)

    // for register 1 in mapping (scale 0.1) use value 25 -> 2.5
    const raw = Buffer.from([0x00, 0x19])
    const ok = pub.publishRegister(1, raw)
    expect(ok).toBe(true)
    expect(fake.last.topic).toBe('sensors/op1/temperature')
    expect(fake.last.payload).toBe('2.5')
  })
})
