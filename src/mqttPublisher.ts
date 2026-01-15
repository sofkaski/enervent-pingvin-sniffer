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
    if (component === 'select') {
      if (entry.ha_command_topic) cfg.command_topic = entry.ha_command_topic
      if (entry.ha_options) {
        // if options is an object mapping (label -> value), extract just the labels
        if (typeof entry.ha_options === 'object' && !Array.isArray(entry.ha_options)) {
          cfg.options = Object.keys(entry.ha_options)
        } else {
          cfg.options = entry.ha_options
        }
      }
      if (entry.ha_value_template) cfg.value_template = entry.ha_value_template
    }

    try {
      // discovery configs should be retained
      this.client.publish(discTopic, JSON.stringify(cfg), { retain: true, qos: cfg.qos }, err => {
        if (err) console.error('mqtt discovery publish error', err)
      })
    } catch (err) {
      console.error('publish discovery exception', err)
    }
  }

  /**
   * Resolve a select option label to its numeric value
   */
  resolveSelectOption(entry: MappingEntry, label: string): number | null {
    if (!entry.ha_options || typeof entry.ha_options === 'string') return null
    
    if (Array.isArray(entry.ha_options)) {
      // Simple array: use index as value
      const idx = entry.ha_options.indexOf(label)
      return idx >= 0 ? idx : null
    } else {
      // Object mapping: look up the value
      const value = entry.ha_options[label]
      return typeof value === 'number' ? value : (typeof value === 'string' ? parseInt(value, 10) : null)
    }
  }

  /**
   * Resolve a numeric value to its select option label
   */
  resolveSelectLabel(entry: MappingEntry, value: number | string): string | null {
    if (!entry.ha_options) return null
    
    const numValue = typeof value === 'number' ? value : parseInt(value as string, 10)
    
    if (Array.isArray(entry.ha_options)) {
      // Simple array: use index to get label
      return numValue >= 0 && numValue < entry.ha_options.length ? entry.ha_options[numValue] : null
    } else {
      // Object mapping: find label with matching value
      for (const [label, v] of Object.entries(entry.ha_options)) {
        const mappedValue = typeof v === 'number' ? v : parseInt(v as string, 10)
        if (mappedValue === numValue) return label
      }
      return null
    }
  }

  publishRegister(register: number | string, raw: Buffer): boolean {
    const entry = this.rm.lookupByAddress(register)
    if (!entry) {
      // unknown register
      return false
    }

    const value = this.parseRaw(entry, raw)
    let transformed = this.rm.applyTransform(entry, value, Array.from(raw))

    // For select components, convert numeric value to label
    if (entry.ha_component === 'select' && entry.ha_options) {
      const label = this.resolveSelectLabel(entry, transformed)
      if (label !== null) {
        transformed = label
      }
    }

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
