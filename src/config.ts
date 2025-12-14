import * as path from 'path'

export const registerMapPath = process.env.REGISTER_MAP_PATH || path.join(process.cwd(), 'config', 'register-map.yaml')
export const registerMapWatch = (process.env.REGISTER_MAP_WATCH === '1') || false
export const addressingBase: 0 | 1 = (process.env.MODBUS_ADDRESS_BASE === '0' ? 0 : 1)

export const logLevel = process.env.LOG_LEVEL || 'info'

// MQTT settings
export const mqttUrl = process.env.MQTT_URL || 'mqtt://localhost:1883'
export const mqttUsername = process.env.MQTT_USERNAME || undefined
export const mqttPassword = process.env.MQTT_PASSWORD || undefined
export const mqttClientId = process.env.MQTT_CLIENT_ID || `enervent-pingvin-${Math.random().toString(16).slice(2, 8)}`
export const mqttBaseTopic = process.env.MQTT_BASE_TOPIC || 'enervent'
export const mqttSendDiscovery = process.env.MQTT_SEND_DISCOVERY || false

// Modbus numbering offset guesses (used when mapping files use 40001-style addressing)
export const modbusConventionalBase = Number(process.env.MODBUS_CONVENTIONAL_BASE || 40001)
