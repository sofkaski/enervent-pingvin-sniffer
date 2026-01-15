import { describe, it, expect } from 'vitest'
import { loadRegisterMap } from '../src/registerMap'
import { join } from 'path'

describe('RegisterMap loader', () => {
  it('loads sample mapping and expands ranges', async () => {
    const file = join(process.cwd(), 'config', 'register-map.yaml')
    const rm = await loadRegisterMap(file)
    const all = rm.listAll()
    expect(all.length).toBeGreaterThan(0)

    const m1 = rm.lookupByAddress(1)
    expect(m1).not.toBeNull()
    expect(m1?.topicResolved).toBe('sensors/op1/temperature')
  })

  it('contains humidity mapping', async () => {
    const file = join(process.cwd(), 'config', 'register-map.yaml')
    const rm = await loadRegisterMap(file)
    const m13 = rm.lookupByAddress(13)
    expect(m13).not.toBeNull()
    expect(m13?.datatype).toBe('uint16')
    expect(m13?.topicResolved).toBe('sensors/wr/humidity')
  })

  it('loads select component with option mapping', async () => {
    const file = join(process.cwd(), 'tests', 'fixtures', 'register-map-with-select.yaml')
    const rm = await loadRegisterMap(file)
    const selectEntry = rm.lookupByAddress(44)
    
    expect(selectEntry).toBeDefined()
    expect(selectEntry?.ha_component).toBe('select')
    expect(selectEntry?.ha_command_topic).toBe('controls/fan_speed/set')
    expect(selectEntry?.ha_options).toEqual({
      'off': 0,
      'low': 1,
      'medium': 2,
      'high': 3
    })
  })

  it('supports both object and array option mappings', async () => {
    const file = join(process.cwd(), 'tests', 'fixtures', 'register-map-with-select.yaml')
    const rm = await loadRegisterMap(file)
    const all = rm.listAll()
    
    // All select components should have ha_options defined
    const selectEntries = all.filter(e => e.ha_component === 'select')
    expect(selectEntries.length).toBeGreaterThan(0)
    selectEntries.forEach(entry => {
      expect(entry.ha_options).toBeDefined()
      // Options can be either array or object
      const isArray = Array.isArray(entry.ha_options)
      const isObject = !isArray && typeof entry.ha_options === 'object'
      expect(isArray || isObject).toBe(true)
    })
  })

  it('preserves ha_bit_index for binary sensors', async () => {
    const file = join(process.cwd(), 'tests', 'fixtures', 'register-map-with-select.yaml')
    const rm = await loadRegisterMap(file)
    
    const pumpStatus = rm.lookupByAddress(50)
    expect(pumpStatus).toBeDefined()
    expect(pumpStatus?.ha_component).toBe('binary_sensor')
    expect(pumpStatus?.ha_bit_index).toBe(0)
    expect(pumpStatus?.ha_device_class).toBe('running')

    const heaterStatus = rm.lookupByAddress(51)
    expect(heaterStatus).toBeDefined()
    expect(heaterStatus?.ha_component).toBe('binary_sensor')
    expect(heaterStatus?.ha_bit_index).toBe(2)
    expect(heaterStatus?.ha_device_class).toBe('heat')
  })

  it('loads all required select fields', async () => {
    const file = join(process.cwd(), 'tests', 'fixtures', 'register-map-with-select.yaml')
    const rm = await loadRegisterMap(file)
    const selectEntry = rm.lookupByAddress(44)
    
    if (selectEntry) {
      // Select components should have these fields
      expect(selectEntry.ha_component).toBe('select')
      expect(selectEntry.ha_command_topic).toBeDefined()
      expect(selectEntry.ha_options).toBeDefined()
      expect(selectEntry.topic).toBe('controls/fan_speed/state')
      expect(selectEntry.unique_id).toBe('fan_speed_control')
    }
  })

  it('supports select with bit pattern options', async () => {
    const file = join(process.cwd(), 'tests', 'fixtures', 'register-map-with-select.yaml')
    const rm = await loadRegisterMap(file)
    const modeSelect = rm.lookupByAddress(60)
    
    expect(modeSelect).toBeDefined()
    expect(modeSelect?.ha_component).toBe('select')
    expect(modeSelect?.ha_options).toEqual({
      'heating': 0b0001,
      'cooling': 0b0010,
      'boost': 0b0100
    })
  })

  it('get all entries for a register', async () => {
    const file = join(process.cwd(), 'config', 'register-map.yaml')
    const rm = await loadRegisterMap(file)
    const m44 = rm.lookupAllByAddress(44)
    expect(m44).not.toBeNull()
    expect(m44[0].datatype).toBe('uint16')
    expect(m44.length).toBe(9)
    expect(m44[m44.length - 1].topicResolved).toBe('heating/state/summer_night_cooling_mode')
  })

})
