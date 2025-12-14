import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import { EventEmitter } from 'events'
import { logLevel } from './config'

export interface Frame {
  timestampMs: number
  microseconds: number
  raw: Buffer
}

export interface SnifferOptions {
  bin?: string
  args?: string[]
  rawMode?: boolean
}

const PCAP_GLOBAL_HEADER_LENGTH = 24
const PCAP_PACKET_HEADER_LENGTH = 16

/**
 * Spawns the `modbus-sniffer` process and parses pcap stdout into `frame` events.
 * Emits:
 * - 'frame' with { timestampMs, microseconds, raw }
 * - 'error' on parse/IO errors
 * - 'start' when process started
 * - 'stop' when process exits
 */
export class ModbusSniffer extends EventEmitter {
  private proc: ChildProcessWithoutNullStreams | null = null
  private buf: Buffer = Buffer.alloc(0)
  private littleEndian = false
  private pcap_global_header_seen = false
  private opt: SnifferOptions
  constructor(opt?: SnifferOptions) {
    super()
    this.opt = opt || { bin: 'sniffer', args: ['--silent'] }
  }

  start() {
    if (this.proc) return
    const bin = this.opt.bin || 'sniffer'
    const args = this.opt.args || ['--silent']
    this.proc = spawn(bin, args)

    this.proc.stdout.on('data', (chunk: Buffer) => this.onData(chunk))
    this.proc.stderr.on('data', (chunk: Buffer) => this.emit('log', chunk.toString()))
    this.proc.on('close', (code, sig) => {
      this.emit('stop', { code, sig })
      this.proc = null
    })
    this.proc.on('error', (err) => this.emit('error', err))
    this.emit('start')
  }

  stop() {
    if (!this.proc) return
    try {
      this.proc.kill()
    } catch (e) {
      // ignore
    }
  }

  private onData(chunk: Buffer) {

    this.buf = Buffer.concat([this.buf, chunk])
    if (logLevel === 'debug') {
      console.debug('Chunk received. Chunk length: %s. Global header seen: %s', chunk.length, this.pcap_global_header_seen)
      console.debug('Chunk content:', chunk.toString('hex'))  
      console.debug('Buffer length: %s.Buffer content: %s', this.buf.length, this.buf.toString('hex'))  
    }

    try {
      // If we haven't seen global header yet, try to parse it
      if (!this.pcap_global_header_seen) {
        if (this.buf.length < PCAP_GLOBAL_HEADER_LENGTH) return
        const magic = this.buf.readUInt32BE(0)
        if (magic === 0xa1b2c3d4) {
          this.littleEndian = false
        } else if (this.buf.readUInt32LE(0) === 0xa1b2c3d4) {
          this.littleEndian = true
        } else {
          this.emit('error', new Error('pcap magic not found'))
          // drop buffer to avoid lock
          this.buf = Buffer.alloc(0)
          return
        }
        if (logLevel === 'debug') {
          console.debug('pcap global header:', this.buf.subarray(0, PCAP_GLOBAL_HEADER_LENGTH).toString('hex') )
          console.debug('pcap global header parsed. littleEndian=', this.littleEndian)
        }
        // drop global header
        this.buf = this.buf.subarray(PCAP_GLOBAL_HEADER_LENGTH)
        this.pcap_global_header_seen = true
      }

      // parse packet headers and payloads
      while (this.buf.length >= PCAP_PACKET_HEADER_LENGTH) {
        const ts_sec = this.littleEndian ? this.buf.readUInt32LE(0) : this.buf.readUInt32BE(0)
        const ts_usec = this.littleEndian ? this.buf.readUInt32LE(4) : this.buf.readUInt32BE(4)
        const incl_len = this.littleEndian ? this.buf.readUInt32LE(8) : this.buf.readUInt32BE(8)
        const orig_len = this.littleEndian ? this.buf.readUInt32LE(12) : this.buf.readUInt32BE(12)

        if (this.buf.length < PCAP_PACKET_HEADER_LENGTH + incl_len) break

        const payload = this.buf.subarray(PCAP_PACKET_HEADER_LENGTH, PCAP_PACKET_HEADER_LENGTH + orig_len)
        const tsMs = ts_sec * 1000 + Math.floor(ts_usec / 1000)
        const frame: Frame = { timestampMs: tsMs, microseconds: ts_usec, raw: payload } 
        if (logLevel === 'debug') {
          console.debug('Emitting frame. Content:', frame.raw.toString('hex'))
        }
        this.emit('frame', frame)
        this.buf = this.buf.subarray(PCAP_PACKET_HEADER_LENGTH + orig_len)
      }
    } catch (err) {
      this.emit('error', err)
      this.buf = Buffer.alloc(0)
    }
  }
}

export default ModbusSniffer
