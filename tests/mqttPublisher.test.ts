import { describe, it, expect } from 'vitest'
import { loadRegisterMap } from '../src/registerMap'
import { join } from 'path'
import { MqttPublisher } from '../src/mqttPublisher'

const max_cooling_mode          = 0b0000000000000010 // bit 1
const heating_stopped_by_alarm  = 0b0000000000000100 // bit 2
const heating_stopped           = 0b0000000000001000 // bit 3
const away_mode                 = 0b0000000000010000 // bit 4
const overpressure_mode         = 0b0000010000000000 // bit 10
const cooker_hood_mode          = 0b0000100000000000 // bit 11
const central_vc_mode           = 0b0001000000000000 // bit 12
const sumer_night_cooling_mode  = 0b0100000000000000 // bit 14


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

  it('resolves select option label to numeric value', async () => {
    const file = join(process.cwd(), 'config', 'register-map.yaml')
    const rm = await loadRegisterMap(file)
    const fake = new FakeClient() as any
    const pub = new MqttPublisher(fake, rm)

    const entry = {
      register: '44',
      topic: 'test/fan',
      datatype: 'uint16' as const,
      ha_component: 'select',
      ha_options: {
        'off': 0,
        'low': 1,
        'medium': 2,
        'high': 3
      }
    }

    expect(pub.resolveSelectOption(entry as any, 'off')).toBe(0)
    expect(pub.resolveSelectOption(entry as any, 'medium')).toBe(2)
    expect(pub.resolveSelectOption(entry as any, 'high')).toBe(3)
    expect(pub.resolveSelectOption(entry as any, 'invalid')).toBe(null)
  })

  it('resolves numeric value to select option label', async () => {
    const file = join(process.cwd(), 'config', 'register-map.yaml')
    const rm = await loadRegisterMap(file)
    const fake = new FakeClient() as any
    const pub = new MqttPublisher(fake, rm)

    const entry = {
      register: '44',
      topic: 'test/fan',
      datatype: 'uint16' as const,
      ha_component: 'select',
      ha_options: {
        'off': 0,
        'low': 1,
        'medium': 2,
        'high': 3
      }
    }

    expect(pub.resolveSelectLabel(entry as any, 0)).toBe('off')
    expect(pub.resolveSelectLabel(entry as any, 2)).toBe('medium')
    expect(pub.resolveSelectLabel(entry as any, 3)).toBe('high')
    expect(pub.resolveSelectLabel(entry as any, 99)).toBe(null)
  })

  it('publishes select component with label conversion', async () => {
    const file = join(process.cwd(), 'config', 'register-map.yaml')
    const rm = await loadRegisterMap(file)
    const fake = new FakeClient() as any
    const pub = new MqttPublisher(fake, rm)

    // Mock a select entry in the map
    const mockEntry = {
      register: '44',
      expandedRegister: '44',
      topic: 'controls/fan_speed/state',
      topicResolved: 'controls/fan_speed/state',
      datatype: 'uint16' as const,
      length: 1,
      ha_component: 'select',
      ha_options: {
        'off': 0,
        'low': 1,
        'medium': 2,
        'high': 3
      }
    }

    // Stub the lookup to return our mock entry
    rm.lookupByAddress = () => mockEntry as any
    rm.lookupAllByAddress = () => [mockEntry] as any

    // Value 2 should be published as "medium"
    const raw = Buffer.from([0x00, 0x02])
    pub.publishRegister('44', raw)
    expect(fake.last.payload).toBe('medium')
  })

  it('extracts bit from value for binary sensor', async () => {
    const file = join(process.cwd(), 'config', 'register-map.yaml')
    const rm = await loadRegisterMap(file)
    const fake = new FakeClient() as any
    const pub = new MqttPublisher(fake, rm)

    const entry = {
      register: '50',
      expandedRegister: '50',
      topic: 'status/test',
      topicResolved: 'status/test',
      datatype: 'uint16' as const,
      ha_component: 'binary_sensor',
      ha_bit_index: 2
    }

    rm.lookupByAddress = () => entry as any
    rm.lookupAllByAddress = () => [entry] as any

    // Value 0b0100 (4) with bit_index 2 should extract bit 2 -> 1
    const raw = Buffer.from([0x00, 0x04])
    pub.publishRegister('50', raw)
    expect(fake.last.payload).toBe('1')

    // Value 0b0000 (0) with bit_index 2 should extract bit 2 -> 0
    const raw2 = Buffer.from([0x00, 0x00])
    pub.publishRegister('50', raw2)
    expect(fake.last.payload).toBe('0')
  })

  it('extracts different bits correctly', async () => {
    const file = join(process.cwd(), 'config', 'register-map.yaml')
    const rm = await loadRegisterMap(file)
    const fake = new FakeClient() as any
    const pub = new MqttPublisher(fake, rm)

    // Test extracting bit 0 from value with bit pattern 0b0001 (1)
    const entry0 = {
      register: '50',
      expandedRegister: '50',
      topic: 'status/test0',
      topicResolved: 'status/test0',
      datatype: 'uint16' as const,
      ha_component: 'binary_sensor',
      ha_bit_index: 0
    }

    rm.lookupByAddress = () => entry0 as any
    rm.lookupAllByAddress = () => [entry0] as any
    const raw1 = Buffer.from([0x00, 0x01])
    pub.publishRegister('50', raw1)
    expect(fake.last.payload).toBe('1')

    // Test extracting bit 3 from value 0b1000 (8)
    const entry3 = {
      register: '50',
      expandedRegister: '50',
      topic: 'status/test3',
      topicResolved: 'status/test3',
      datatype: 'uint16' as const,
      ha_component: 'binary_sensor',
      ha_bit_index: 3
    }

    rm.lookupByAddress = () => entry3 as any
    rm.lookupAllByAddress = () => [entry3] as any
    const raw8 = Buffer.from([0x00, 0x08])
    pub.publishRegister('50', raw8)
    expect(fake.last.payload).toBe('1')
  })

  it('handles select with array options', async () => {
    const file = join(process.cwd(), 'config', 'register-map.yaml')
    const rm = await loadRegisterMap(file)
    const fake = new FakeClient() as any
    const pub = new MqttPublisher(fake, rm)

    const entry = {
      register: '44',
      topic: 'test/fan',
      datatype: 'uint16' as const,
      ha_component: 'select',
      ha_options: ['off', 'low', 'medium', 'high']
    }

    // Array indices are used as values
    expect(pub.resolveSelectOption(entry as any, 'off')).toBe(0)
    expect(pub.resolveSelectOption(entry as any, 'medium')).toBe(2)
    expect(pub['resolveSelectLabel'](entry as any, 1)).toBe('low')
    expect(pub['resolveSelectLabel'](entry as any, 3)).toBe('high')
  })

  // Register 44 in the mapping has multiple binary sensors defined
  // Case: all sensors off
  it('publishes all binary sensors for a register, all off', async () => {
    const file = join(process.cwd(), 'config', 'register-map.yaml')
    const rm = await loadRegisterMap(file)
    const fake = new FakeClient() as any
    const pub = new MqttPublisher(fake, rm)

    const raw = Buffer.from([0x00, 0x00])
    const result = pub.publishRegister(44, raw)
    expect(result).toBe(true)
    for (const p of fake.published) {
      expect(p?.payload).toBe('0')
    }
    // The last topic should be the one from the last entry
    expect(fake.last.topic).toBe('heating/state/summer_night_cooling_mode')
    expect(fake.last.payload).toBe('0')
  })
  // Case: all sensors on
  it('publishes all binary sensors for a register, all on', async () => {
    const file = join(process.cwd(), 'config', 'register-map.yaml')
    const rm = await loadRegisterMap(file)
    const fake = new FakeClient() as any
    const pub = new MqttPublisher(fake, rm)

    const raw = Buffer.from([0xff, 0xff])
    const result = pub.publishRegister(44, raw)
    expect(result).toBe(true)
    for (const p of fake.published) {
      expect(p?.payload).toBe('1')
    }
    // The last topic should be the one from the last entry
    expect(fake.last.topic).toBe('heating/state/summer_night_cooling_mode')
    expect(fake.last.payload).toBe('1')
  })
  // Case: overpressure sensor on, others off
  it('publishes all binary sensors for a register, all on', async () => {
    const file = join(process.cwd(), 'config', 'register-map.yaml')
    const rm = await loadRegisterMap(file)
    const fake = new FakeClient() as any
    const pub = new MqttPublisher(fake, rm)

    const raw = Buffer.from([overpressure_mode >> 8, overpressure_mode & 0xff])
    const result = pub.publishRegister(44, raw)
    expect(result).toBe(true)
    for (const p of fake.published) {
      const topic = p?.topic || ''
      if (topic === 'heating/state/overpressure_mode') {
        expect(p?.payload).toBe('1')
      } else {
        expect(p?.payload).toBe('0')
      }
    }
  })
  // Case: cooker hood mode and summer night cooling on, others off
  it('publishes all binary sensors for a register, cooker hood mode and summer night cooling on', async () => {
    const file = join(process.cwd(), 'config', 'register-map.yaml')
    const rm = await loadRegisterMap(file)
    const fake = new FakeClient() as any
    const pub = new MqttPublisher(fake, rm)

    const mode_value = cooker_hood_mode | sumer_night_cooling_mode
    const raw = Buffer.from([mode_value >> 8, mode_value & 0xff])
    const result = pub.publishRegister(44, raw)
    expect(result).toBe(true)
    for (const p of fake.published) {
      const topic = p?.topic || ''
      if (topic === 'heating/state/cooker_hood_mode' || topic === 'heating/state/summer_night_cooling_mode') {
        expect(p?.payload).toBe('1')
      } else {
        expect(p?.payload).toBe('0')
      }
    }
  })

  it('publishes MQTT discovery configs for sensor and select entries', async () => {
    const fake = new FakeClient() as any

    const entries = [
      {
        expandedRegister: '101',
        topic: 'sensors/temp1',
        topicResolved: 'sensors/temp1',
        datatype: 'uint16' as const,
        ha_component: 'sensor',
        description: 'Room Temp',
        unique_id: 'room temp/1',
        qos: 1,
        unit: '°C'
      },
      {
        expandedRegister: '102',
        topic: 'controls/fan_speed/state',
        topicResolved: 'controls/fan_speed/state',
        datatype: 'uint16' as const,
        ha_component: 'select',
        ha_options: {
          'off': 0,
          'low': 1
        },
        ha_command_topic: 'controls/fan_speed/set',
        description: 'Fan',
        unique_id: 'fan#2'
      }
    ]

    const rm: any = {
      listAll: () => entries
    }

    const pub = new MqttPublisher(fake, rm)
    pub.publishAllDiscovery()

    // Two discovery messages should have been published
    expect(fake.published.length).toBe(2)

    const first = fake.published[0]!
    expect(first.topic).toBe('homeassistant/sensor/room_temp_1/config')
    const cfg1 = JSON.parse(first.payload || '{}')
    expect(cfg1.name).toBe('Room Temp')
    expect(cfg1.state_topic).toBe('sensors/temp1')
    expect(cfg1.unique_id).toBe('room_temp_1')
    expect(cfg1.qos).toBe(1)
    expect(cfg1.device && cfg1.device.identifiers).toBeDefined()

    const second = fake.published[1]!
    expect(second.topic).toBe('homeassistant/select/fan_2/config')
    const cfg2 = JSON.parse(second.payload || '{}')
    expect(cfg2.name).toBe('Fan')
    expect(cfg2.state_topic).toBe('controls/fan_speed/state')
    expect(cfg2.unique_id).toBe('fan_2')
    // select should include options as array of labels
    expect(Array.isArray(cfg2.options)).toBe(true)
    expect(cfg2.options).toEqual(['off', 'low'])
    expect(cfg2.command_topic).toBe('controls/fan_speed/set')
  })
})
