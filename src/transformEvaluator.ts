import vm from 'vm'

export interface TransformContext {
  value: any
  raw?: Buffer | number[]
  meta?: Record<string, any>
}

/**
 * Safely evaluate a short transform expression in a restricted VM context.
 * The expression should be a JS expression (not a full program) that returns the transformed value.
 */
export function evaluateTransform(expression: string, ctx: TransformContext) {
  // Build a minimal sandbox containing only the provided context.
  const sandbox: Record<string, any> = {
    value: ctx.value,
    raw: ctx.raw,
    meta: ctx.meta || {},
  }

  // Run the expression in a new VM context with a small timeout.
  try {
    const script = new vm.Script(expression)
    const contextified = vm.createContext(sandbox)
    // timeout in ms
    const result = script.runInContext(contextified, { timeout: 50 })
    return result
  } catch (err) {
    // propagate error to caller for logging
    throw err
  }
}
