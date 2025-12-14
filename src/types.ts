export type Datatype =
  | 'int16'
  | 'uint16'
  | 'int32'
  | 'uint32'
  | 'int64'
  | 'uint64'
  | 'float32'
  | 'float64'
  | 'bool'
  | 'string'

export interface MappingEntryRaw {
  register: string
  datatype: Datatype
  length?: number
  scale?: number
  unit?: string
  topic: string
  ha_component?: string
  ha_device_class?: string
  ha_state_topic_override?: string
  retain?: boolean
  qos?: 0 | 1 | 2
  unique_id?: string
  description?: string
  transform?: string
  poll_interval?: number
  readonly?: boolean
}

export interface MappingEntry extends MappingEntryRaw {
  // for expanded entries from ranges
  expandedRegister?: number | string
  offset?: number
  topicResolved?: string
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

export interface RegisterMapOptions {
  addressingBase?: 0 | 1
  watch?: boolean
}
