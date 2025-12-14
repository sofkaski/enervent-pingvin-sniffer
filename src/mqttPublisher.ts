import { RegisterMap } from './registerMap'
import { MappingEntry } from './types'
import type { MqttClient as MQTTClient } from 'mqtt'

export interface PublisherOptions {
  defaultQos?: 0 | 1 | 2
  defaultRetain?: boolean
}

export class MqttPublisher {
  private client: MQTTClient
  private rm: RegisterMap
  private opts: PublisherOptions

  constructor(client: MQTTClient, rm: RegisterMap, opts?: PublisherOptions) {
    this.client = client
    this.rm = rm
    this.opts = opts || { defaultQos: 0, defaultRetain: false }
  }

  publishRegister(register: number | string, raw: Buffer): boolean {
    const entry = this.rm.lookupByAddress(register)
    if (!entry) {
      // unknown register
      return false
    }

    const value = this.parseRaw(entry, raw)
    const transformed = this.rm.applyTransform(entry, value, Array.from(raw))

    const topic = entry.ha_state_topic_override || entry.topicResolved || entry.topic
    const payload = typeof transformed === 'object' ? JSON.stringify(transformed) : String(transformed)
    const retain = entry.retain ?? this.opts.defaultRetain ?? false
    const qos = (entry.qos ?? this.opts.defaultQos ?? 0) as 0 | 1 | 2

    try {
      this.client.publish(topic, payload, { qos, retain }, err => {
        if (err) console.error('mqtt publish error', err)
      })
      return true
    } catch (err) {
      console.error('publish exception', err)
      return false
    }
  }

  private parseRaw(entry: MappingEntry, raw: Buffer): any {
    const dt = entry.datatype
    // ensure buffer length matches requested length (words -> bytes)
    const lengthWords = entry.length ?? (dt === 'int32' || dt === 'uint32' || dt === 'float32' ? 2 : 1)
    const expectedBytes = lengthWords * 2
    const buf = raw.length >= expectedBytes ? raw.subarray(0, expectedBytes) : raw

    try {
      switch (dt) {
        case 'int16':
          return buf.readInt16BE(0) * (entry.scale ?? 1)
        case 'uint16':
          return buf.readUInt16BE(0) * (entry.scale ?? 1)
        case 'int32':
          return buf.readInt32BE(0) * (entry.scale ?? 1)
        case 'uint32':
          return buf.readUInt32BE(0) * (entry.scale ?? 1)
        case 'float32':
          return buf.readFloatBE(0) * (entry.scale ?? 1)
        case 'float64':
          return buf.readDoubleBE(0) * (entry.scale ?? 1)
        case 'bool':
          // any non-zero value is true
          return buf[0] !== 0
        case 'string':
          return buf.toString('utf8')
        default:
          return buf.toString('hex')
      }
    } catch (err) {
      // fallback: return hex
      return buf.toString('hex')
    }
  }
}
