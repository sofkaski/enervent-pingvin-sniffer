import { loadRegisterMap } from './registerMap'
import { logLevel, registerMapPath, addressingBase, mqttUrl, mqttClientId, mqttUsername, mqttPassword, mqttSendDiscovery, modbusConventionalBase } from './config'
import mqtt from 'mqtt'
import ModbusSniffer from './modbusSniffer'
import { MqttPublisher } from './mqttPublisher'
import * as path from 'path'

function parseModbusFrame(buf: Buffer) {
  if (logLevel === 'debug') {
    console.debug('Got frame for parsing', buf.toString('hex'))
  }
  if (buf.length < 4) return null
  const slave = buf.readUInt8(0)
  const func = buf.readUInt8(1)
  return { slave, func, buf }
}

export async function start() {
  console.log('Starting enervent-pingvin-sniffer (live)')
  const rm = await loadRegisterMap(registerMapPath, { addressingBase, watch: false })
  if (logLevel === 'debug') {
    console.debug('RegisterMap loaded. Nbr of registers: %s', rm.listAll().length)
  }

  rm.on('loaded', () => console.log('Register map loaded; entries:', rm.listAll().length))
  rm.on('error', (err: any) => console.error('RegisterMap error:', err && err.message ? err.message : err))

  // MQTT client
  const client = mqtt.connect(mqttUrl, { clientId: mqttClientId, username: mqttUsername, password: mqttPassword })
  await new Promise<void>((resolve, reject) => {
    client.on('connect', () => {
      console.log('MQTT connected')
      resolve()
    })
    client.on('error', (err) => reject(err))
  })

  const publisher = new MqttPublisher(client as any, rm)
  // publish Home Assistant MQTT discovery configs (retained)
  if (mqttSendDiscovery) {
    publisher.publishAllDiscovery()
  }

  // Sniffer
  const snifferArgs = process.env.SNIFFER_ARGS ? process.env.SNIFFER_ARGS.split(' ') : ['--silent']
  const sniffer = new ModbusSniffer({ bin: process.env.SNIFFER_BIN || path.join(process.cwd(), 'modbus-sniffer', 'sniffer'), args: snifferArgs })
  sniffer.start()

  // Capture window: stop after all defined registers have been seen or after timeout
  const expectedRegs = new Set<number | string>(
    rm.listAll().map(e => e.expandedRegister).filter((v): v is number | string => v !== undefined)
  )
  const expectedCount = expectedRegs.size
  const captured = new Set<number | string>()
  const timeoutMs = Number(process.env.CAPTURE_TIMEOUT_MS || 60000)
  let finishTimer: NodeJS.Timeout | null = null
  const finishIfDone = () => {
    if (expectedCount > 0 && captured.size >= expectedCount) {
      finish('all-captured')
    }
  }

  const finish = async (reason = 'timeout') => {
    if (finishTimer) {
      clearTimeout(finishTimer)
      finishTimer = null
    }
    console.log('Capture finished:', reason)
    sniffer.stop()
    client.end()
    await rm.close()
    process.exit(0)
  }

  // start overall timeout
  finishTimer = setTimeout(() => finish('timeout'), timeoutMs)

  sniffer.on('frame', (f: any) => {
    const buf: Buffer = f.raw
    if (logLevel === 'debug') {
      console.debug('Got frame', buf.toString('hex'))
    }
    const p = parseModbusFrame(buf)
    if (!p) return
    const { slave, func } = p

    // Only consider frames that are Write Multiple Registers (function 16)
    if (func !== 16) return

    // Write Multiple Registers request: [slave, func, addr_hi, addr_lo, qty_hi, qty_lo, byteCount, data..., CRC_LO, CRC_HI]
    if (buf.length >= 7) {
      const addr = buf.readUInt16BE(2)
      const qty = buf.readUInt16BE(4)
      if (logLevel === 'debug') {
        console.debug('Address:', addr, 'Quantity:', qty)
      }
      const dataStart = 7
      for (let i = 0; i < qty; i++) {
        const offset = dataStart + i * 2
        if (offset + 1 >= buf.length) break
        const raw = buf.subarray(offset, offset + 2)
        let published = false
        if (rm.lookupByAddress(addr + i)) {
          if (logLevel === 'debug') {
            console.debug('Publishing register %d with value %s', addr + i, raw.toString('hex'))
          }
          const ok = publisher.publishRegister(addr + i, raw)
          if (ok) captured.add(addr + i)
          published = true
        }
        if (!published && (logLevel === 'debug')) {
          console.debug('Unmapped register %d with value %s', addr + i, raw.toString('hex'))
        }
      }
      finishIfDone()
    }
  })

  const stop = async () => {
    console.log('Shutting down...')
    sniffer.stop()
    client.end()
    await rm.close()
    process.exit(0)
  }

  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)

  return { rm, sniffer, client }
}

if (require.main === module) {
  start().catch(err => {
    console.error(err)
    process.exit(1)
  })
}
