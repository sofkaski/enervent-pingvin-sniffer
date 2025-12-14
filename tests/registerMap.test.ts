import { describe, it, expect } from 'vitest'
import { loadRegisterMap } from '../src/registerMap'
import { join } from 'path'

describe('RegisterMap loader', () => {
  it('loads sample mapping and expands ranges', async () => {
    const file = join(process.cwd(), 'config', 'register-map.yaml')
    const rm = await loadRegisterMap(file)
    const all = rm.listAll()
    expect(all.length).toBeGreaterThan(0)

    const m40001 = rm.lookupByAddress(40001)
    expect(m40001).not.toBeNull()
    expect(m40001?.topicResolved).toBe('sensors/room1/temperature')
  })

  it('applies transform for bitfield', async () => {
    const file = join(process.cwd(), 'config', 'register-map.yaml')
    const rm = await loadRegisterMap(file)
    const m = rm.lookupByAddress(40050)
    expect(m).not.toBeNull()
    // simulate uint16 where bit 3 is set (value = 8)
    const raw = Buffer.from([0x00, 0x08])
    const parsed = 8
    const out = rm.applyTransform(m as any, parsed, Array.from(raw))
    expect(out).toBe('alarm')
  })
})
