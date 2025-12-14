import { promises as fs } from 'fs'
import { EventEmitter } from 'events'
import * as path from 'path'
import * as yaml from 'js-yaml'
import {
  MappingEntry,
  MappingEntryRaw,
  ValidationResult,
  RegisterMapOptions,
} from './types'
import { evaluateTransform, TransformContext } from './transformEvaluator'

function canonicalKeyForRegister(r: number | string) {
  if (typeof r === 'number') return `reg:${r}`
  return String(r)
}

function parseRegisterSpec(spec: string, addressingBase: 0 | 1 = 1): Array<{ register: number | string; offset: number }> {
  spec = spec.trim()
  // coils like coil:5
  if (spec.startsWith('coil:')) {
    const v = spec.slice(5)
    const n = Number(v)
    if (!Number.isFinite(n)) return [{ register: spec, offset: 0 }]
    return [{ register: `coil:${n}`, offset: 0 }]
  }

  // range form 40001-40005
  if (spec.includes('-')) {
    const [a, b] = spec.split('-').map(s => Number(s.trim()))
    if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return []
    const out: Array<{ register: number; offset: number }> = []
    for (let i = a; i <= b; i++) out.push({ register: i, offset: i - a })
    return out
  }

  // count form 40001:5 (start:count)
  if (spec.includes(':')) {
    const [aStr, countStr] = spec.split(':').map(s => s.trim())
    const a = Number(aStr)
    const count = Number(countStr)
    if (!Number.isFinite(a) || !Number.isFinite(count) || count <= 0) return []
    const out: Array<{ register: number; offset: number }> = []
    for (let i = 0; i < count; i++) out.push({ register: a + i, offset: i })
    return out
  }

  // single numeric address
  const n = Number(spec)
  if (Number.isFinite(n)) return [{ register: n, offset: 0 }]

  // fallback: return raw string
  return [{ register: spec, offset: 0 }]
}

export class RegisterMap extends EventEmitter {
  private map: Map<string, MappingEntry> = new Map()
  private raw: MappingEntryRaw[] = []
  private filePath?: string
  private opts: RegisterMapOptions
  private watcher: any

  constructor(opts?: RegisterMapOptions) {
    super()
    this.opts = opts || { addressingBase: 1 }
  }

  async load(filePath: string): Promise<ValidationResult> {
    this.filePath = filePath
    try {
      const txt = await fs.readFile(filePath, 'utf8')
      const parsed = yaml.load(txt) as any
      if (!parsed || !Array.isArray(parsed.mappings)) {
        const err = 'mapping file must contain a top-level `mappings` array'
        this.emit('error', new Error(err))
        return { valid: false, errors: [err] }
      }
      const raws: MappingEntryRaw[] = parsed.mappings
      const errors: string[] = []
      const newMap = new Map<string, MappingEntry>()

      raws.forEach((entry, idx) => {
        if (!entry.register) errors.push(`entry[${idx}]: missing register`)
        if (!entry.datatype) errors.push(`entry[${idx}]: missing datatype`)
        if (!entry.topic) errors.push(`entry[${idx}]: missing topic`)
      })

      if (errors.length) {
        this.emit('error', new Error('validation errors'))
        return { valid: false, errors }
      }

      // expand ranges and populate map
      raws.forEach(entry => {
        const expanded = parseRegisterSpec(entry.register, this.opts.addressingBase || 1)
        expanded.forEach(({ register, offset }) => {
          const resolvedTopic = entry.topic
            .replace('{offset}', String(offset))
            .replace('{register}', String(register))
          const me: MappingEntry = {
            ...entry,
            expandedRegister: register,
            offset,
            topicResolved: resolvedTopic,
          }
          const key = canonicalKeyForRegister(register)
          newMap.set(key, me)
        })
      })

      this.map = newMap
      this.raw = raws
      this.emit('loaded')

      // optional watch
      if (this.opts.watch && this.filePath) this.startWatch()

      return { valid: true, errors: [] }
    } catch (err: any) {
      this.emit('error', err)
      return { valid: false, errors: [String(err.message || err)] }
    }
  }

  lookupByAddress(address: number | string): MappingEntry | null {
    const key = canonicalKeyForRegister(address)
    return this.map.get(key) ?? null
  }

  expandRanges(entry: MappingEntryRaw): MappingEntry[] {
    const expanded = parseRegisterSpec(entry.register, this.opts.addressingBase || 1)
    return expanded.map(({ register, offset }) => ({
      ...entry,
      expandedRegister: register,
      offset,
      topicResolved: entry.topic
        .replace('{offset}', String(offset))
        .replace('{register}', String(register)),
    }))
  }

  listAll(): MappingEntry[] {
    return Array.from(this.map.values())
  }

  /**
   * Apply an optional transform expression defined on a mapping entry.
   * Returns transformed value or the original value if no transform defined or on error.
   */
  applyTransform(entry: MappingEntry, value: any, raw?: Buffer | number[]) {
    if (!entry || !entry.transform) return value
    try {
      const ctx: TransformContext = {
        value,
        raw,
        meta: {
          register: entry.expandedRegister,
          datatype: entry.datatype,
          offset: entry.offset,
        },
      }
      const out = evaluateTransform(entry.transform as string, ctx)
      return out
    } catch (err: any) {
      this.emit('error', new Error(`transform error for ${entry.register}: ${err && err.message ? err.message : err}`))
      return value
    }
  }

  private startWatch() {
    if (!this.filePath) return
    try {
      if (this.watcher) return
      // simple fs.watch with debounce
      const fswatch = require('fs').watch
      let timer: NodeJS.Timeout | null = null
      this.watcher = fswatch(this.filePath, (_ev: any) => {
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => {
          if (this.filePath) this.load(this.filePath as string)
        }, 200)
      })
      this.emit('watching')
    } catch (e) {
      this.emit('error', e)
    }
  }

  async close(): Promise<void> {
    if (this.watcher && typeof this.watcher.close === 'function') this.watcher.close()
    this.map.clear()
    this.raw = []
    this.emit('close')
  }
}

export async function loadRegisterMap(filePath: string, opts?: RegisterMapOptions) {
  const rm = new RegisterMap(opts)
  await rm.load(filePath)
  return rm
}
