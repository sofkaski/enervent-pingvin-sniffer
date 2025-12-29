import { RegisterMap } from './registerMap'
import { MappingEntry } from './types'
import type { MqttClient as MQTTClient } from 'mqtt'

export interface PublisherOptions {
  defaultQos?: 0 | 1 | 2
  defaultRetain?: boolean
}

/* MQTT Discovery device information. TODO: This should actually be got from the device */ 
const mqttDeviceInformation = {
  'identifiers': 'Pingvin Kotilämpö W',
  'name': 'Enervent Greenair',
  'sw_version': '5.62',
  'model': 'Pingvin Eco EDW',
  'manufacturer': 'Enervent',
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
  
  /**
   * Publish Home Assistant MQTT discovery config for all mapped entries.
   * Config messages are published with retain=true so Home Assistant can discover on boot.
   */
  publishAllDiscovery(): void {
    const entries = this.rm.listAll()
    for (const e of entries) this.publishDiscoveryForEntry(e)
  }

  private publishDiscoveryForEntry(entry: MappingEntry): void {
    const component = (entry.ha_component || 'sensor')
    const stateTopic = entry.ha_state_topic_override || entry.topicResolved || entry.topic
    if (!stateTopic) return

    const unique = entry.unique_id || String(entry.topicResolved || entry.topic || entry.expandedRegister)
    const uniqClean = unique.replace(/[^a-zA-Z0-9_-]/g, '_')
    const discTopic = `homeassistant/${component}/${uniqClean}/config`

    const cfg: any = {
      name: entry.description || entry.topicResolved || entry.topic || String(entry.expandedRegister),
      state_topic: stateTopic,
      unique_id: uniqClean,
      qos: (entry.qos ?? this.opts.defaultQos ?? 0),
      device: mqttDeviceInformation,
    }
    if (entry.ha_device_class) cfg.device_class = entry.ha_device_class
    if (entry.unit) cfg.unit_of_measurement = entry.unit

    try {
      // discovery configs should be retained
      this.client.publish(discTopic, JSON.stringify(cfg), { retain: true, qos: cfg.qos }, err => {
        if (err) console.error('mqtt discovery publish error', err)
      })
    } catch (err) {
      console.error('publish discovery exception', err)
    }
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
