declare module 'mqtt' {
  export type IClientPublishOptions = {
    qos?: 0 | 1 | 2
    retain?: boolean
    dup?: boolean
    messageId?: number
    properties?: Record<string, any>
  }

  export interface MqttClient {
    publish(topic: string, message: string | Buffer, opts?: IClientPublishOptions, callback?: (err?: Error) => void): void
    subscribe(topic: string | string[], opts?: any, callback?: (err: Error | null, granted?: any) => void): void
    end(force?: boolean, cb?: () => void): void
    on(event: string, cb: (...args: any[]) => void): this
  }

  export function connect(url: string, options?: any): MqttClient
  export default { connect }
}
