import { describe, it, expect } from 'vitest'
import { loadRegisterMap } from '../src/registerMap'
import { join } from 'path'
import { MqttPublisher } from '../src/mqttPublisher'

class FakeClient {
  public published: [{ topic?: string; payload?: string; opts?: any }?] = []
  public get last() {
    return this.published[this.published.length - 1]
  }
  publish(topic: string, payload: string | Buffer, opts: any, cb?: (err?: any) => void) {
    this.published.push({ topic, payload: typeof payload === 'string' ? payload : payload.toString(), opts })
    if (cb) cb()
  }
}

describe('MqttPublisher integration (discovery using real map)', () => {
  it('publishes discovery messages for entries from real register map', async () => {
    const file = join(process.cwd(), 'config', 'register-map.yaml')
    const rm = await loadRegisterMap(file)
    const fake = new FakeClient() as any
    const pub = new MqttPublisher(fake, rm)

    pub.publishAllDiscovery()

    // At least one discovery message should have been published
    expect(fake.published.length).toBeGreaterThan(0)

    // At least one sensor discovery should exist
    const sensorMsg = fake.published.find(p => (p?.topic || '').startsWith('homeassistant/sensor/'))
    expect(sensorMsg).toBeDefined()
    if (sensorMsg) {
      const cfg = JSON.parse(sensorMsg.payload || '{}')
      expect(cfg.state_topic).toBeDefined()
      expect(cfg.unique_id).toBeDefined()
      expect(cfg.device && cfg.device.identifiers).toBeDefined()
    }

    // All discovery messages should be published with retain=true
    for (const p of fake.published) {
      expect(p?.opts && p.opts.retain).toBe(true)
    }
  })
})
